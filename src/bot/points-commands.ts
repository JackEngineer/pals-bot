import { Telegraf } from 'telegraf';
import { PointsService } from '../services/points-service';
import { BottleService } from '../services/bottle-service';
import { logger } from '../utils/logger';
import { ExtendedContext } from './command-state';
import { formatLeaderboard } from '../utils/message-formatter';

export function setupPointsCommands(bot: Telegraf<ExtendedContext>) {
    // 积分查询命令
    bot.command('points', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const [userPoints, recentTransactions, privileges] = await Promise.all([
                PointsService.getUserPoints(userId, username),
                PointsService.getUserTransactions(userId, 5),
                BottleService.getUserPrivileges(userId)
            ]);

            let message = `💰 你的积分信息\n\n`;
            message += `🏆 等级: ${userPoints.level_name} (Lv.${userPoints.level})\n`;
            message += `💎 总积分: ${userPoints.total_points}\n`;
            message += `💰 可用积分: ${userPoints.available_points}\n`;
            message += `🔥 连续签到: ${userPoints.daily_checkin_streak} 天\n`;

            // 显示特权状态
            const activePrivileges = [];
            if (privileges.isVip) activePrivileges.push('💎VIP会员');
            if (privileges.hasExtraThrows) activePrivileges.push('📝额外投放');
            if (privileges.hasDoublePoints) activePrivileges.push('💫双倍积分');
            if (privileges.hasLuckyBoost) activePrivileges.push('🍀幸运加成');

            if (activePrivileges.length > 0) {
                message += `\n🎯 活跃特权: ${activePrivileges.join(', ')}\n`;
            }

            if (recentTransactions.length > 0) {
                message += `\n📊 最近交易记录:\n`;
                recentTransactions.forEach(tx => {
                    const sign = tx.type === 'earn' ? '+' : '-';
                    const amount = Math.abs(tx.amount);
                    message += `${sign}${amount} - ${tx.description}\n`;
                });
            }

            message += `\n💡 使用 /checkin 每日签到获得积分`;

            await ctx.reply(message);

        } catch (error) {
            logger.error('获取积分信息失败:', error);
            await ctx.reply('❌ 获取积分信息失败，请稍后重试');
        }
    });

    // 每日签到命令
    bot.command('checkin', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const result = await PointsService.dailyCheckin(userId, username);
            
            if (result.success) {
                let message = `✅ ${result.message}`;
                
                if (result.level_bonus && result.level_bonus > 0) {
                    message += `\n🎖️ 等级奖励: +${result.level_bonus}积分`;
                }
                
                if (result.streak_bonus && result.streak_bonus > 0) {
                    message += `\n🎉 连击奖励: +${result.streak_bonus}积分`;
                }

                await ctx.reply(message);
            } else {
                await ctx.reply(`ℹ️ ${result.message}`);
            }

        } catch (error) {
            logger.error('签到失败:', error);
            await ctx.reply('❌ 签到失败，请稍后重试');
        }
    });

    // 积分商店命令
    bot.command('shop', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const userPoints = await PointsService.getUserPoints(userId);
            const items = await PointsService.getShopItems(undefined, userPoints.level);
            
            if (items.length === 0) {
                await ctx.reply('🛒 积分商店暂时没有适合你等级的商品');
                return;
            }

            let message = `🛒 积分商店\n`;
            message += `💰 你的积分: ${userPoints.available_points}\n`;
            message += `🏆 你的等级: ${userPoints.level_name}\n\n`;
            
            const categories = ['privilege', 'decoration', 'special'];
            const categoryNames = {
                'privilege': '🔥 功能特权',
                'decoration': '✨ 装饰道具', 
                'special': '💫 特殊物品'
            };

            for (const category of categories) {
                const categoryItems = items.filter(item => item.category === category);
                if (categoryItems.length > 0) {
                    message += `${categoryNames[category as keyof typeof categoryNames]}\n`;
                    categoryItems.forEach(item => {
                        const canAfford = userPoints.available_points >= item.price ? '✅' : '❌';
                        message += `${canAfford} ${item.name} - ${item.price}积分\n`;
                        message += `   ${item.description}\n`;
                        if (item.duration_days) {
                            message += `   ⏰ 有效期: ${item.duration_days}天\n`;
                        }
                        message += `   /buy ${item.id}\n\n`;
                    });
                }
            }

            message += `💡 使用 /buy <商品ID> 来购买商品`;

            await ctx.reply(message);

        } catch (error) {
            logger.error('获取商店信息失败:', error);
            await ctx.reply('❌ 获取商店信息失败，请稍后重试');
        }
    });

    // 购买商品命令
    bot.command('buy', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                await ctx.reply(
                    '🛒 购买格式错误\n\n' +
                    '正确格式: /buy <商品ID>\n' +
                    '例如: /buy vip_member_30d\n\n' +
                    '使用 /shop 查看所有商品'
                );
                return;
            }

            const itemId = args[1];
            const result = await PointsService.purchaseItem(userId, itemId);

            if (result.success) {
                let message = `${result.message}`;
                if (result.remaining_points !== undefined) {
                    message += `\n💰 剩余积分: ${result.remaining_points}`;
                }
                if (result.purchase?.expires_at) {
                    const expiresAt = new Date(result.purchase.expires_at);
                    message += `\n⏰ 到期时间: ${expiresAt.toLocaleString('zh-CN')}`;
                }
                await ctx.reply(message);
            } else {
                await ctx.reply(`❌ ${result.message}`);
            }

        } catch (error) {
            logger.error('购买商品失败:', error);
            await ctx.reply('❌ 购买失败，请稍后重试');
        }
    });

    // 积分排行榜命令
    bot.command('leaderboard', async (ctx) => {
        try {
            const leaderboard = await PointsService.getLeaderboard(10);
            
            if (leaderboard.length === 0) {
                await ctx.reply('📊 暂无排行榜数据');
                return;
            }

            const message = formatLeaderboard(leaderboard);
            await ctx.reply(message);

        } catch (error) {
            logger.error('获取排行榜失败:', error);
            await ctx.reply('❌ 获取排行榜失败，请稍后重试');
        }
    });

    // 我的成就命令
    bot.command('achievements', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const achievements = await PointsService.getUserAchievements(userId);
            
            if (achievements.length === 0) {
                await ctx.reply(
                    '🏆 你还没有解锁任何成就\n\n' +
                    '快去投放漂流瓶、回复消息、每日签到来解锁成就吧！'
                );
                return;
            }

            let message = `🏆 你的成就列表\n\n`;
            
            achievements.forEach((achievement, index) => {
                const unlockDate = new Date(achievement.unlocked_at).toLocaleDateString('zh-CN');
                message += `🎖️ ${achievement.achievement_name}\n`;
                message += `   奖励: ${achievement.reward_points}积分\n`;
                message += `   解锁时间: ${unlockDate}\n\n`;
            });

            await ctx.reply(message);

        } catch (error) {
            logger.error('获取成就失败:', error);
            await ctx.reply('❌ 获取成就失败，请稍后重试');
        }
    });

    // VIP专属命令
    bot.command('vip', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const isVip = await PointsService.checkVipStatus(userId);
            
            if (!isVip) {
                await ctx.reply(
                    '💎 VIP专属功能\n\n' +
                    '你还不是VIP会员，无法使用此功能。\n\n' +
                    '💰 购买VIP会员可享受:\n' +
                    '• 昵称显示💎VIP标识\n' +
                    '• 所有行为获得1.2倍积分\n' +
                    '• 每日签到额外+3积分\n' +
                    '• 发送漂流瓶带✨特效标识\n' +
                    '• 专属VIP命令权限\n\n' +
                    '使用 /shop 查看VIP会员商品'
                );
                return;
            }

            const [userPoints, purchases, transactions] = await Promise.all([
                PointsService.getUserPoints(userId),
                PointsService.getUserPurchases(userId, 'active'),
                PointsService.getUserTransactions(userId, 10)
            ]);

            let message = `💎 VIP专属面板\n\n`;
            message += `🏆 等级: ${userPoints.level_name}\n`;
            message += `💰 积分: ${userPoints.available_points}\n`;
            
            if (userPoints.vip_expires_at) {
                const expiresAt = new Date(userPoints.vip_expires_at);
                message += `⏰ VIP到期: ${expiresAt.toLocaleString('zh-CN')}\n`;
            }

            message += `\n🎯 活跃特权:\n`;
            purchases.forEach(purchase => {
                const expiresAt = purchase.expires_at ? 
                    new Date(purchase.expires_at).toLocaleDateString('zh-CN') : '永久';
                message += `• ${purchase.item_name} (${expiresAt})\n`;
            });

            message += `\n📊 最近积分收入:\n`;
            const recentEarnings = transactions
                .filter(tx => tx.type === 'earn')
                .slice(0, 5);
            
            recentEarnings.forEach(tx => {
                message += `+${tx.amount} - ${tx.description}\n`;
            });

            await ctx.reply(message);

        } catch (error) {
            logger.error('VIP面板失败:', error);
            await ctx.reply('❌ 获取VIP信息失败，请稍后重试');
        }
    });

    logger.info('✅ 积分系统命令设置完成');
} 