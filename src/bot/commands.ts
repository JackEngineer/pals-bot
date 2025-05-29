import { Telegraf, Context } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { PointsService } from '../services/points-service';
import { 
    formatBottleMessage, 
    formatUserStats, 
    formatGlobalStats, 
    formatThrowSuccess, 
    formatReplySuccess, 
    formatHelpMessage 
} from '../utils/message-formatter';
import { logger } from '../utils/logger';

export function setupCommands(bot: Telegraf<Context>) {
    // 开始命令
    bot.start((ctx) => {
        ctx.reply(
            `🌊 欢迎来到漂流瓶世界！\n\n` +
            `这里你可以:\n` +
            `📝 投放漂流瓶 - 分享你的心情和想法\n` +
            `🎣 捡拾漂流瓶 - 发现他人的故事\n` +
            `💬 回复漂流瓶 - 与陌生人交流\n` +
            `💰 积分系统 - 参与互动获得奖励\n\n` +
            `开始你的漂流瓶之旅吧！ 🚀\n\n` +
            `使用 /help 查看详细帮助`
        );
    });

    // 帮助命令
    bot.help((ctx) => {
        ctx.reply(formatHelpMessage());
    });

    // 投放漂流瓶命令
    bot.command('throw', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是群组消息
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            if (isGroupMessage) {
                // 在群组中提醒用户私聊Bot
                const botInfo = await ctx.telegram.getMe();
                await ctx.reply(
                    `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                    `为了保护您的隐私，请私聊我来投放漂流瓶：\n` +
                    `👆 点击我的用户名 @${botInfo.username} 开始私聊\n\n` +
                    `💡 然后发送: /throw 你的漂流瓶内容`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📱 开始私聊', url: `https://t.me/${botInfo.username}` }
                            ]]
                        }
                    }
                );
                return;
            }

            // 获取命令后的文本
            const text = ctx.message.text.replace('/throw', '').trim();
            
            if (!text) {
                await ctx.reply(
                    '📝 请在命令后输入漂流瓶内容\n\n' +
                    '例如: /throw 今天天气真好，心情也很棒！\n\n' +
                    '或者直接发送文字、图片、语音等内容也可以投放漂流瓶哦～'
                );
                return;
            }

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content: text
            });

            await ctx.reply(formatThrowSuccess(bottleId, text));

        } catch (error) {
            logger.error('投放漂流瓶失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 捡拾漂流瓶命令
    bot.command('pick', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是群组消息
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            if (isGroupMessage) {
                // 在群组中提醒用户私聊Bot
                const botInfo = await ctx.telegram.getMe();
                await ctx.reply(
                    `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                    `为了保护您的隐私，请私聊我来捡拾漂流瓶：\n` +
                    `👆 点击我的用户名 @${botInfo.username} 开始私聊\n\n` +
                    `💡 然后发送: /pick`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📱 开始私聊', url: `https://t.me/${botInfo.username}` }
                            ]]
                        }
                    }
                );
                return;
            }

            const bottle = await BottleService.pickBottle(userId);
            
            if (!bottle) {
                await ctx.reply(
                    '🌊 大海中暂时没有漂流瓶了...\n\n' +
                    '你可以先投放一个漂流瓶，让更多人参与进来！\n' +
                    '直接发送消息或使用 /throw 命令投放漂流瓶 📝'
                );
                return;
            }

            const message = formatBottleMessage(bottle);
            
            // 如果有媒体文件，先发送媒体
            if (bottle.media_file_id && bottle.media_type) {
                switch (bottle.media_type) {
                    case 'photo':
                        await ctx.replyWithPhoto(bottle.media_file_id, { caption: message });
                        break;
                    case 'voice':
                        await ctx.replyWithVoice(bottle.media_file_id);
                        await ctx.reply(message);
                        break;
                    case 'video':
                        await ctx.replyWithVideo(bottle.media_file_id, { caption: message });
                        break;
                    case 'document':
                        await ctx.replyWithDocument(bottle.media_file_id, { caption: message });
                        break;
                    default:
                        await ctx.reply(message);
                }
            } else {
                await ctx.reply(message);
            }

            // 提示可以回复
            await ctx.reply(
                `💬 想要回复这个漂流瓶吗？\n` +
                `使用命令: /reply ${bottle.id} 你的回复内容`
            );

        } catch (error) {
            logger.error('捡拾漂流瓶失败:', error);
            await ctx.reply('❌ 捡拾失败，请稍后重试');
        }
    });

    // 回复漂流瓶命令
    bot.command('reply', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是群组消息
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            if (isGroupMessage) {
                // 在群组中提醒用户私聊Bot
                const botInfo = await ctx.telegram.getMe();
                await ctx.reply(
                    `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                    `为了保护您的隐私，请私聊我来回复漂流瓶：\n` +
                    `👆 点击我的用户名 @${botInfo.username} 开始私聊\n\n` +
                    `💡 然后发送: /reply <瓶子ID> <回复内容>`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📱 开始私聊', url: `https://t.me/${botInfo.username}` }
                            ]]
                        }
                    }
                );
                return;
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 3) {
                await ctx.reply(
                    '💬 回复格式错误\n\n' +
                    '正确格式: /reply <瓶子ID> <回复内容>\n' +
                    '例如: /reply abc123 谢谢分享，很有趣的想法！'
                );
                return;
            }

            const bottleId = args[1];
            const replyContent = args.slice(2).join(' ');

            await BottleService.replyToBottle({
                bottleId,
                senderId: userId,
                senderUsername: username,
                content: replyContent
            });

            await ctx.reply(formatReplySuccess(bottleId));

        } catch (error) {
            logger.error('回复漂流瓶失败:', error);
            await ctx.reply('❌ 回复失败，请检查瓶子ID是否正确');
        }
    });

    // 个人统计命令
    bot.command('stats', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const userStats = await BottleService.getUserStats(userId);
            const message = formatUserStats(userStats);
            await ctx.reply(message);

        } catch (error) {
            logger.error('获取统计信息失败:', error);
            await ctx.reply('❌ 获取统计信息失败，请稍后重试');
        }
    });

    // 全局统计命令
    bot.command('global', async (ctx) => {
        try {
            const globalStats = await BottleService.getGlobalStats();
            const message = formatGlobalStats(globalStats);
            await ctx.reply(message);

        } catch (error) {
            logger.error('获取全局统计失败:', error);
            await ctx.reply('❌ 获取全局统计失败，请稍后重试');
        }
    });

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

            let message = `🏆 积分排行榜 (Top 10)\n\n`;
            
            leaderboard.forEach((user, index) => {
                const rank = index + 1;
                const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `${rank}.`;
                const displayName = user.username || `用户${String(user.user_id).slice(-4)}`;
                const vipMark = user.vip_expires_at && new Date(user.vip_expires_at) > new Date() ? '💎' : '';
                message += `${medal} ${displayName}${vipMark}\n`;
                message += `   ${user.level_name} | ${user.total_points}积分\n\n`;
            });

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

    // 状态命令
    bot.command('status', async (ctx) => {
        try {
            const globalStats = await BottleService.getGlobalStats();
            let message = `🤖 机器人状态: 运行中\n\n`;
            message += `📊 数据统计:\n`;
            message += `• 总漂流瓶: ${globalStats.totalBottles} 个\n`;
            message += `• 漂流中: ${globalStats.activeBottles} 个\n`;
            message += `• 总回复: ${globalStats.totalReplies} 条\n`;
            message += `• 用户数: ${globalStats.totalUsers} 人\n`;
            message += `• 总积分: ${globalStats.totalPoints} 分\n`;
            
            if (globalStats.topUser) {
                message += `\n👑 积分王者: ${globalStats.topUser.username}\n`;
                message += `   ${globalStats.topUser.level} | ${globalStats.topUser.points}积分\n`;
            }
            
            message += `\n⏰ 运行时间: ${Math.floor(process.uptime() / 3600)}小时${Math.floor((process.uptime() % 3600) / 60)}分钟`;
            
            await ctx.reply(message);
        } catch (error) {
            logger.error('获取状态失败:', error);
            await ctx.reply('❌ 获取状态失败');
        }
    });

    logger.info('✅ 漂流瓶命令设置完成（包含积分系统）');
} 