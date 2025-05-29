import { Telegraf, Context } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { PointsService } from '../services/points-service';
import { ChatService } from '../services/chat-service';
import { NotificationService } from '../services/notification-service';
import { FriendService } from '../services/friend-service';
import { UserService } from '../services/user-service';
import { BroadcastService } from '../services/broadcast-service';
import { 
    formatBottleMessage, 
    formatUserStats, 
    formatGlobalStats, 
    formatThrowSuccess, 
    formatReplySuccess, 
    formatHelpMessage 
} from '../utils/message-formatter';
import { logger } from '../utils/logger';

// 存储待回复的漂流瓶ID (内存存储，实际项目中应该使用数据库)
const pendingReplies = new Map<number, string>();

// 存储已显示好友申请按钮的会话 (避免重复显示)
const shownFriendButtons = new Set<string>();

// 扩展 Context 以支持会话数据
interface ExtendedContext extends Context {
    pendingReplies?: Map<number, string>;
}

export function setupCommands(bot: Telegraf<ExtendedContext>) {
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
                `💬 想要回复这个漂流瓶吗？`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '💬 回复漂流瓶', callback_data: `reply_${bottle.id}` },
                            { text: '🎣 继续捡拾', callback_data: 'pick_another' }
                        ]]
                    }
                }
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

    // 处理回调查询（按钮点击）
    bot.on('callback_query', async (ctx) => {
        try {
            // 类型断言以访问 data 属性
            const callbackQuery = ctx.callbackQuery as any;
            const callbackData = callbackQuery.data;
            
            if (!callbackData) {
                await ctx.answerCbQuery('❌ 无效的操作');
                return;
            }

            const userId = ctx.from?.id;
            const username = ctx.from?.username;

            if (!userId) {
                await ctx.answerCbQuery('❌ 无法获取用户信息');
                return;
            }

            // 发起聊天按钮
            if (callbackData.startsWith('start_chat_')) {
                const parts = callbackData.split('_');
                const bottleId = parts[2];
                const replierId = parseInt(parts[3]);
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                // 发送聊天邀请给回复者
                try {
                    await NotificationService.sendChatInviteNotification(
                        replierId,
                        {
                            initiatorId: userId,
                            initiatorUsername: username,
                            bottleId: bottleId
                        }
                    );
                    
                    await ctx.reply(
                        `💌 聊天邀请已发送！\n\n` +
                        `我已经向对方发送了聊天邀请，请耐心等待回复～\n` +
                        `如果对方同意，我会立即通知你开始聊天 ✨`
                    );
                } catch (error) {
                    logger.error('发送聊天邀请失败:', error);
                    await ctx.reply('❌ 发送聊天邀请失败，请稍后重试');
                }
                
                return;
            }

            // 忽略回复按钮
            if (callbackData.startsWith('ignore_reply_')) {
                await ctx.answerCbQuery('已忽略这次回复');
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                await ctx.reply('🙈 你选择忽略了这次回复\n\n海上还有更多漂流瓶等着你去发现！');
                return;
            }

            // 接受聊天按钮
            if (callbackData.startsWith('accept_chat_')) {
                const parts = callbackData.split('_');
                const bottleId = parts[2];
                const initiatorId = parseInt(parts[3]);
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                try {
                    // 创建聊天会话
                    const sessionId = await ChatService.createChatSession(initiatorId, userId, bottleId);
                    
                    // 通知双方聊天开始
                    await Promise.all([
                        NotificationService.sendChatAcceptedNotification(initiatorId, username),
                        NotificationService.sendChatAcceptedNotification(userId, undefined)
                    ]);
                    
                    await ctx.reply(
                        `🎉 聊天已开始！\n\n` +
                        `现在你们可以通过我进行匿名聊天了\n` +
                        `📝 直接发送消息，我会转发给对方\n` +
                        `🔚 发送 /endchat 结束聊天\n\n` +
                        `开始你们的对话吧～ ✨`
                    );
                    
                } catch (error) {
                    logger.error('接受聊天失败:', error);
                    await ctx.reply('❌ 接受聊天失败，请稍后重试');
                }
                
                return;
            }

            // 拒绝聊天按钮
            if (callbackData.startsWith('decline_chat_')) {
                const parts = callbackData.split('_');
                const initiatorId = parseInt(parts[3]);
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                try {
                    // 通知发起者被拒绝
                    await NotificationService.sendChatDeclinedNotification(initiatorId, username);
                    
                    await ctx.reply(
                        `😌 你礼貌地拒绝了聊天邀请\n\n` +
                        `没关系，每个人都有选择的权利\n` +
                        `继续你的漂流瓶之旅吧 🌊`
                    );
                    
                } catch (error) {
                    logger.error('拒绝聊天通知失败:', error);
                    await ctx.reply('操作已完成');
                }
                
                return;
            }

            // 申请添加好友按钮
            if (callbackData.startsWith('add_friend_')) {
                const sessionId = callbackData.replace('add_friend_', '');
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                try {
                    // 获取聊天会话信息
                    const activeChat = await ChatService.getActiveChat(userId);
                    if (!activeChat || activeChat.id !== sessionId) {
                        await ctx.reply('❌ 找不到相关的聊天会话');
                        return;
                    }
                    
                    const partnerId = activeChat.user1_id === userId ? activeChat.user2_id : activeChat.user1_id;
                    
                    // 检查是否已经是好友
                    const areFriends = await FriendService.areFriends(userId, partnerId);
                    if (areFriends) {
                        await ctx.reply('😊 你们已经是好友了！');
                        return;
                    }
                    
                    // 发送好友申请
                    await FriendService.sendFriendRequest(userId, partnerId, sessionId, '希望能和你成为朋友！');
                    
                    // 获取最新的申请ID
                    const request = await FriendService.getPendingRequest(userId, partnerId, sessionId);
                    if (request) {
                        // 通知对方收到好友申请
                        await NotificationService.sendFriendRequestNotification(
                            partnerId,
                            {
                                requesterId: userId,
                                requesterUsername: username,
                                requestId: request.id,
                                sessionId: sessionId,
                                message: request.message
                            }
                        );
                        
                        // 确认申请已发送
                        await NotificationService.sendFriendRequestSentConfirmation(userId);
                    }
                    
                } catch (error) {
                    logger.error('发送好友申请失败:', error);
                    if ((error as Error).message === '已经是好友关系') {
                        await ctx.reply('😊 你们已经是好友了！');
                    } else if ((error as Error).message === '已有待处理的好友申请') {
                        await ctx.reply('📤 你已经向对方发送过好友申请，请耐心等待回复');
                    } else {
                        await ctx.reply('❌ 发送好友申请失败，请稍后重试');
                    }
                }
                
                return;
            }

            // 通过按钮结束聊天
            if (callbackData.startsWith('end_chat_')) {
                const sessionId = callbackData.replace('end_chat_', '');
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                try {
                    const activeChat = await ChatService.getActiveChat(userId);
                    if (activeChat && activeChat.id === sessionId) {
                        const partnerId = activeChat.user1_id === userId ? activeChat.user2_id : activeChat.user1_id;
                        
                        // 结束聊天会话
                        await ChatService.endChatSession(userId);
                        
                        // 通知双方聊天结束
                        await Promise.all([
                            ctx.reply(
                                `👋 聊天已结束\n\n` +
                                `感谢这次愉快的交流！\n` +
                                `继续探索更多漂流瓶吧 🌊`
                            ),
                            NotificationService.sendMessage(
                                partnerId,
                                `👋 对方结束了聊天\n\n` +
                                `感谢这次愉快的交流！\n` +
                                `继续探索更多漂流瓶吧 🌊`
                            )
                        ]);
                    } else {
                        await ctx.reply('🤔 你当前没有进行中的聊天会话');
                    }
                } catch (error) {
                    logger.error('结束聊天失败:', error);
                    await ctx.reply('❌ 结束聊天失败，请稍后重试');
                }
                
                return;
            }

            // 接受好友申请按钮
            if (callbackData.startsWith('accept_friend_')) {
                const requestId = parseInt(callbackData.replace('accept_friend_', ''));
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                try {
                    // 获取申请信息
                    const request = await FriendService.getFriendRequestById(requestId);
                    if (!request || request.target_id !== userId) {
                        await ctx.reply('❌ 找不到相关的好友申请');
                        return;
                    }
                    
                    // 接受好友申请
                    await FriendService.acceptFriendRequest(requestId);
                    
                    // 通知双方成为好友
                    await Promise.all([
                        NotificationService.sendFriendRequestAcceptedNotification(
                            request.requester_id,
                            {
                                friendId: userId
                            }
                        ),
                        NotificationService.sendFriendRequestAcceptedNotification(
                            userId,
                            {
                                friendId: request.requester_id
                            }
                        )
                    ]);
                    
                } catch (error) {
                    logger.error('接受好友申请失败:', error);
                    await ctx.reply('❌ 接受好友申请失败，请稍后重试');
                }
                
                return;
            }

            // 拒绝好友申请按钮
            if (callbackData.startsWith('reject_friend_')) {
                const requestId = parseInt(callbackData.replace('reject_friend_', ''));
                
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                try {
                    // 获取申请信息
                    const request = await FriendService.getFriendRequestById(requestId);
                    if (!request || request.target_id !== userId) {
                        await ctx.reply('❌ 找不到相关的好友申请');
                        return;
                    }
                    
                    // 拒绝好友申请
                    await FriendService.rejectFriendRequest(requestId);
                    
                    // 通知申请者被拒绝
                    await NotificationService.sendFriendRequestRejectedNotification(request.requester_id, username);
                    
                    await ctx.reply(
                        `😌 你礼貌地拒绝了好友申请\n\n` +
                        `没关系，每个人都有选择的权利 💭`
                    );
                    
                } catch (error) {
                    logger.error('拒绝好友申请失败:', error);
                    await ctx.reply('❌ 拒绝好友申请失败，请稍后重试');
                }
                
                return;
            }

            // 私聊按钮
            if (callbackData.startsWith('private_chat_')) {
                const friendId = parseInt(callbackData.replace('private_chat_', ''));
                
                await ctx.answerCbQuery();
                
                try {
                    // 检查是否为好友
                    const areFriends = await FriendService.areFriends(userId, friendId);
                    if (!areFriends) {
                        await ctx.reply('❌ 你们不是好友关系');
                        return;
                    }
                    
                    // 获取好友信息并发送私聊启动通知
                    await NotificationService.sendPrivateChatStartNotification(
                        userId,
                        {
                            friendId: friendId
                        }
                    );
                    
                } catch (error) {
                    logger.error('启动私聊失败:', error);
                    await ctx.reply('❌ 启动私聊失败，请稍后重试');
                }
                
                return;
            }

            // 查看资料按钮
            if (callbackData.startsWith('view_profile_')) {
                const friendId = parseInt(callbackData.replace('view_profile_', ''));
                
                await ctx.answerCbQuery();
                
                try {
                    // 检查是否为好友
                    const areFriends = await FriendService.areFriends(userId, friendId);
                    if (!areFriends) {
                        await ctx.reply('❌ 你们不是好友关系');
                        return;
                    }
                    
                    // 发送用户资料
                    await NotificationService.sendUserProfile(
                        userId,
                        {
                            friendId: friendId,
                            addedDate: '最近'
                        }
                    );
                    
                } catch (error) {
                    logger.error('查看资料失败:', error);
                    await ctx.reply('❌ 查看资料失败，请稍后重试');
                }
                
                return;
            }

            // 删除好友按钮
            if (callbackData.startsWith('remove_friend_')) {
                const friendId = parseInt(callbackData.replace('remove_friend_', ''));
                
                await ctx.answerCbQuery();
                
                try {
                    // 检查是否为好友
                    const areFriends = await FriendService.areFriends(userId, friendId);
                    if (!areFriends) {
                        await ctx.reply('❌ 你们不是好友关系');
                        return;
                    }
                    
                    // 删除好友关系
                    await FriendService.removeFriend(userId, friendId);
                    
                    await ctx.reply(
                        `💔 已删除好友关系\n\n` +
                        `你们不再是好友了，但美好的回忆会一直存在 🌊`
                    );
                    
                } catch (error) {
                    logger.error('删除好友失败:', error);
                    await ctx.reply('❌ 删除好友失败，请稍后重试');
                }
                
                return;
            }

            // 回复漂流瓶按钮（保留原有逻辑）
            if (callbackData.startsWith('reply_')) {
                const bottleId = callbackData.replace('reply_', '');
                
                // 回答回调查询
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                // 提示用户输入回复内容
                await ctx.reply(
                    `💬 请发送你的回复内容:\n\n` +
                    `你的回复将发送给瓶子 #${bottleId.slice(-8)} 的主人\n` +
                    `📝 可以发送文字、图片、语音等任何内容`,
                    {
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: '输入你的回复内容...'
                        }
                    }
                );
                
                // 保存待回复的瓶子ID
                pendingReplies.set(userId, bottleId);
                return;
            }

            // 继续捡拾按钮
            if (callbackData === 'pick_another') {
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });
                
                // 自动执行捡拾命令
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
                    `💬 想要回复这个漂流瓶吗？`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💬 回复漂流瓶', callback_data: `reply_${bottle.id}` },
                                { text: '🎣 继续捡拾', callback_data: 'pick_another' }
                            ]]
                        }
                    }
                );
                
                return;
            }

            await ctx.answerCbQuery('❌ 未知的操作');

        } catch (error) {
            logger.error('处理回调查询失败:', error);
            await ctx.answerCbQuery('❌ 操作失败，请稍后重试');
        }
    });

    // 结束聊天命令
    bot.command('endchat', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const isInChat = await ChatService.isUserInChat(userId);
            
            if (!isInChat) {
                await ctx.reply('🤔 你当前没有进行中的聊天会话');
                return;
            }

            // 获取聊天伙伴
            const activeChat = await ChatService.getActiveChat(userId);
            if (activeChat) {
                const partnerId = activeChat.user1_id === userId ? activeChat.user2_id : activeChat.user1_id;
                
                // 结束聊天会话
                await ChatService.endChatSession(userId);
                
                // 通知双方聊天结束
                await Promise.all([
                    ctx.reply(
                        `👋 聊天已结束\n\n` +
                        `感谢这次愉快的交流！\n` +
                        `继续探索更多漂流瓶吧 🌊`
                    ),
                    NotificationService.sendMessage(
                        partnerId,
                        `👋 对方结束了聊天\n\n` +
                        `感谢这次愉快的交流！\n` +
                        `继续探索更多漂流瓶吧 🌊`
                    )
                ]);
            }

        } catch (error) {
            logger.error('结束聊天失败:', error);
            await ctx.reply('❌ 结束聊天失败，请稍后重试');
        }
    });

    // 好友管理命令
    bot.command('friends', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const [friendStats, friends, pendingReceived] = await Promise.all([
                FriendService.getFriendStats(userId),
                FriendService.getFriends(userId),
                FriendService.getPendingRequestsReceived(userId)
            ]);

            let message = `👫 好友管理\n\n`;
            message += `📊 统计信息:\n`;
            message += `• 好友数量: ${friendStats.totalFriends}\n`;
            message += `• 待处理申请: ${friendStats.pendingRequestsReceived}\n`;
            message += `• 已发送申请: ${friendStats.pendingRequestsSent}\n\n`;

            if (friends.length > 0) {
                message += `👥 好友列表:\n`;
                // 获取好友的友好显示名称
                const friendDisplayNames = await UserService.getBatchUserDisplayNames(friends.slice(0, 5));
                friends.slice(0, 5).forEach((friendId, index) => {
                    const displayName = friendDisplayNames.get(friendId) || `用户${String(friendId).slice(-4)}`;
                    message += `${index + 1}. ${displayName}\n`;
                });
                if (friends.length > 5) {
                    message += `... 还有 ${friends.length - 5} 位好友\n`;
                }
                message += `\n`;
            }

            if (pendingReceived.length > 0) {
                message += `📨 待处理申请:\n`;
                // 获取申请者的友好显示名称
                const requesterIds = pendingReceived.slice(0, 3).map(req => req.requester_id);
                const requesterDisplayNames = await UserService.getBatchUserDisplayNames(requesterIds);
                pendingReceived.slice(0, 3).forEach((request, index) => {
                    const displayName = requesterDisplayNames.get(request.requester_id) || `用户${String(request.requester_id).slice(-4)}`;
                    message += `${index + 1}. 来自 ${displayName}\n`;
                });
                if (pendingReceived.length > 3) {
                    message += `... 还有 ${pendingReceived.length - 3} 个申请\n`;
                }
            }

            message += `\n💡 提示: 通过漂流瓶聊天可以申请添加好友！`;

            await ctx.reply(message);

        } catch (error) {
            logger.error('获取好友信息失败:', error);
            await ctx.reply('❌ 获取好友信息失败，请稍后重试');
        }
    });

    // 调试命令 - 检查聊天消息计数
    bot.command('debug_chat', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const activeChat = await ChatService.getActiveChat(userId);
            if (!activeChat) {
                await ctx.reply('🤔 你当前没有进行中的聊天会话');
                return;
            }

            const partnerId = activeChat.user1_id === userId ? activeChat.user2_id : activeChat.user1_id;
            const messageCount = await ChatService.getSessionMessageCount(activeChat.id);
            const shouldShowButton = await ChatService.shouldShowFriendRequestButton(activeChat.id, 10);
            const areFriends = await FriendService.areFriends(userId, partnerId);
            const messageDistribution = await ChatService.getSessionMessageDistribution(activeChat.id);

            let debugMessage = `🔍 聊天调试信息\n\n`;
            debugMessage += `🆔 会话ID: ${activeChat.id}\n`;
            debugMessage += `👥 聊天双方: ${activeChat.user1_id} <-> ${activeChat.user2_id}\n`;
            debugMessage += `📊 总消息数: ${messageCount}\n`;
            debugMessage += `📈 消息分布:\n`;
            debugMessage += `  • 用户 ${activeChat.user1_id}: ${messageDistribution.user1Messages} 条\n`;
            debugMessage += `  • 用户 ${activeChat.user2_id}: ${messageDistribution.user2Messages} 条\n`;
            debugMessage += `✅ 达到阈值: ${shouldShowButton ? '是' : '否'} (>= 10条)\n`;
            debugMessage += `🔄 已显示按钮: ${shownFriendButtons.has(activeChat.id) ? '是' : '否'}\n`;
            debugMessage += `👫 已是好友: ${areFriends ? '是' : '否'}\n`;
            debugMessage += `🎮 按钮显示条件: ${shouldShowButton && !shownFriendButtons.has(activeChat.id) ? '满足' : '不满足'}\n\n`;
            debugMessage += `💡 说明:\n`;
            debugMessage += `- 需要消息数≥10条时首次显示按钮\n`;
            debugMessage += `- 每个会话只显示一次按钮\n`;
            debugMessage += `- 好友和非好友都会显示相应的互动选项`;

            await ctx.reply(debugMessage);

        } catch (error) {
            logger.error('调试聊天失败:', error);
            await ctx.reply('❌ 调试失败，请稍后重试');
        }
    });

    // 消息处理中间件
    bot.on('message', async (ctx, next) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                return next();
            }

            // 检查聊天类型，确保匿名聊天功能只在私聊中生效
            const chatType = ctx.chat.type;
            const isPrivateChat = chatType === 'private';
            const isGroupChat = chatType === 'group' || chatType === 'supergroup';

            // 自动更新用户信息（只在私聊中更新，避免群组消息频繁更新）
            if (isPrivateChat) {
                try {
                    await UserService.updateUserInfo(userId, {
                        username: ctx.from?.username,
                        first_name: ctx.from?.first_name,
                        last_name: ctx.from?.last_name
                    });
                } catch (error) {
                    logger.error('更新用户信息失败:', error);
                    // 不影响主要功能，继续处理
                }
            }

            // 匿名聊天功能仅在私聊中生效
            if (isPrivateChat) {
                // 首先检查是否在聊天会话中
                const isInChat = await ChatService.isUserInChat(userId);
                
                if (isInChat) {
                    const activeChat = await ChatService.getActiveChat(userId);
                    if (activeChat) {
                        const partnerId = activeChat.user1_id === userId ? activeChat.user2_id : activeChat.user1_id;
                        const senderDisplay = username ? `@${username}` : '匿名用户';
                        
                        const message = ctx.message as any;
                        let messageContent = '';
                        let mediaType: 'photo' | 'voice' | 'video' | 'document' | undefined = undefined;
                        let mediaFileId: string | undefined = undefined;
                        
                        // 处理不同类型的消息
                        if ('text' in message) {
                            messageContent = message.text;
                            
                            // 如果是命令，跳过转发
                            if (messageContent.startsWith('/')) {
                                return next();
                            }
                        } else if ('photo' in message) {
                            messageContent = message.caption || '[图片消息]';
                            mediaType = 'photo';
                            mediaFileId = message.photo[message.photo.length - 1].file_id;
                        } else if ('voice' in message) {
                            messageContent = '[语音消息]';
                            mediaType = 'voice';
                            mediaFileId = message.voice.file_id;
                        } else if ('video' in message) {
                            messageContent = message.caption || '[视频消息]';
                            mediaType = 'video';
                            mediaFileId = message.video.file_id;
                        } else if ('document' in message) {
                            messageContent = message.caption || `[文档消息: ${message.document.file_name || '未知文件'}]`;
                            mediaType = 'document';
                            mediaFileId = message.document.file_id;
                        } else {
                            messageContent = '[多媒体消息]';
                        }

                        // 转发消息给聊天伙伴
                        try {
                            await NotificationService.forwardChatMessage(
                                partnerId,
                                senderDisplay,
                                messageContent,
                                mediaType,
                                mediaFileId
                            );
                            
                            // 记录聊天消息
                            await ChatService.logChatMessage(
                                activeChat.id,
                                userId,
                                messageContent,
                                mediaType
                            );
                            
                            // 检查是否需要显示好友申请按钮
                            const shouldShowButton = await ChatService.shouldShowFriendRequestButton(activeChat.id, 10);
                            const messageCount = await ChatService.getSessionMessageCount(activeChat.id);
                            
                            // 当消息数达到10条且未显示过按钮时显示（避免重复显示）
                            if (shouldShowButton && !shownFriendButtons.has(activeChat.id)) {
                                // 记录已显示按钮，避免重复
                                shownFriendButtons.add(activeChat.id);
                                
                                // 检查双方是否已经是好友
                                const areFriends = await FriendService.areFriends(userId, partnerId);
                                
                                if (areFriends) {
                                    // 如果已是好友，发送好友互动选项
                                    await Promise.all([
                                        NotificationService.sendFriendInteractionOptions(userId, activeChat.id, messageCount, partnerId),
                                        NotificationService.sendFriendInteractionOptions(partnerId, activeChat.id, messageCount, userId)
                                    ]);
                                } else {
                                    // 如果不是好友，发送好友申请选项
                                    await Promise.all([
                                        NotificationService.sendInteractionOptions(userId, activeChat.id, messageCount),
                                        NotificationService.sendInteractionOptions(partnerId, activeChat.id, messageCount)
                                    ]);
                                }
                            }
                            
                            // 匿名消息已发送
                            await ctx.reply('咻~ 匿名消息已发送，输入 /endchat 可结束聊天');
                            
                        } catch (error) {
                            logger.error('转发聊天消息失败:', error);
                            await ctx.reply('❌ 消息转发失败，请稍后重试');
                        }
                        
                        return; // 不继续处理其他消息逻辑
                    }
                }

                // 检查是否有待回复的瓶子（仅在私聊中处理）
                if (pendingReplies.has(userId)) {
                    const bottleId = pendingReplies.get(userId);
                    
                    // 检查消息是否是回复消息
                    const message = ctx.message as any;
                    if (message.reply_to_message) {
                        let replyContent = '';
                        let mediaType: 'photo' | 'voice' | 'video' | 'document' | undefined = undefined;
                        let mediaFileId: string | undefined = undefined;
                        
                        // 处理不同类型的消息
                        if ('text' in message) {
                            replyContent = message.text;
                        } else if ('photo' in message) {
                            replyContent = message.caption || '[图片消息]';
                            mediaType = 'photo';
                            mediaFileId = message.photo[message.photo.length - 1].file_id;
                        } else if ('voice' in message) {
                            replyContent = '[语音消息]';
                            mediaType = 'voice';
                            mediaFileId = message.voice.file_id;
                        } else if ('video' in message) {
                            replyContent = message.caption || '[视频消息]';
                            mediaType = 'video';
                            mediaFileId = message.video.file_id;
                        } else if ('document' in message) {
                            replyContent = message.caption || `[文档消息: ${message.document.file_name || '未知文件'}]`;
                            mediaType = 'document';
                            mediaFileId = message.document.file_id;
                        } else {
                            replyContent = '[多媒体消息]';
                        }

                        if (replyContent && bottleId) {
                            await BottleService.replyToBottle({
                                bottleId,
                                senderId: userId,
                                senderUsername: username,
                                content: replyContent,
                                mediaType,
                                mediaFileId
                            });

                            await ctx.reply(formatReplySuccess(bottleId));
                            
                            // 清除待回复状态
                            pendingReplies.delete(userId);
                            return;
                        }
                    }
                }
            }

            // 群组消息处理：简单记录日志但不进行特殊处理
            if (isGroupChat) {
                logger.info(`群组消息: 用户${userId} 在群组${ctx.chat.id}中发送消息`);
                // 群组消息不进行漂流瓶相关处理，直接传递给下一个中间件
                return next();
            }

            // 继续处理其他消息
            return next();

        } catch (error) {
            logger.error('处理消息失败:', error);
            // 只在私聊中回复错误消息，避免在群组中产生干扰
            if (ctx.chat.type === 'private') {
                await ctx.reply('❌ 处理消息失败，请稍后重试');
            }
        }
    });

    logger.info('✅ 漂流瓶命令设置完成（包含积分系统）');

    // 添加广播管理命令
    setupBroadcastCommands(bot);
}

// 广播管理命令
function setupBroadcastCommands(bot: Telegraf<ExtendedContext>) {
    // 开启/关闭群组广播
    bot.command(['broadcast_on', 'broadcast_off'], async (ctx) => {
        try {
            const isOn = ctx.message.text.includes('_on');
            const chatType = ctx.chat.type;
            
            // 仅在群组中生效
            if (chatType !== 'group' && chatType !== 'supergroup') {
                await ctx.reply('❌ 此命令只能在群组中使用');
                return;
            }

            // 检查权限 - 只有管理员可以执行
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            try {
                const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                const isAdmin = member.status === 'administrator' || member.status === 'creator';
                
                if (!isAdmin) {
                    await ctx.reply('❌ 只有群组管理员可以使用此命令');
                    return;
                }
            } catch (error) {
                logger.error('检查管理员权限失败:', error);
                await ctx.reply('❌ 无法验证管理员权限');
                return;
            }

            // 执行开启/关闭广播
            const success = await BroadcastService.toggleGroupBroadcast(ctx.chat.id, isOn);
            
            if (success) {
                if (isOn) {
                    await ctx.reply(`✅ 群组广播已开启

📢 本群组将会收到以下定期推送：
• 每日活跃推广 (每天上午10点)
• 功能更新通知 (每周三下午3点)  
• 周末活动推广 (每周五晚上8点)

💡 可以随时使用 /broadcast_off 关闭广播`);
                } else {
                    await ctx.reply('✅ 群组广播已关闭\n\n💡 可以随时使用 /broadcast_on 重新开启');
                }
            } else {
                await ctx.reply('❌ 操作失败，请稍后重试');
            }
        } catch (error) {
            logger.error('处理广播命令失败:', error);
            await ctx.reply('❌ 命令执行失败，请稍后重试');
        }
    });

    // 手动执行广播 (仅私聊，管理员专用)
    bot.command('admin_broadcast', async (ctx) => {
        try {
            // 仅在私聊中使用
            if (ctx.chat.type !== 'private') {
                await ctx.reply('❌ 此命令只能在私聊中使用');
                return;
            }

            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是超级管理员（可以通过环境变量设置）
            const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];
            if (!adminIds.includes(userId)) {
                await ctx.reply('❌ 权限不足');
                return;
            }

            // 获取命令参数
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0) {
                await ctx.reply(`📢 广播管理命令

使用方法：
/admin_broadcast list - 查看所有广播模板
/admin_broadcast send <模板ID> - 执行指定模板的广播
/admin_broadcast stats - 查看广播统计
/admin_broadcast groups - 查看活跃群组

示例：
/admin_broadcast send 1`);
                return;
            }

            const action = args[0];

            switch (action) {
                case 'list':
                    const templates = await BroadcastService.getBroadcastTemplates();
                    if (templates.length === 0) {
                        await ctx.reply('暂无广播模板');
                        return;
                    }

                    let templateList = '📋 广播模板列表：\n\n';
                    templates.forEach(template => {
                        templateList += `🆔 ID: ${template.id}\n`;
                        templateList += `📝 名称: ${template.name}\n`;
                        templateList += `📄 内容预览: ${template.content.substring(0, 50)}...\n`;
                        templateList += `📅 创建时间: ${template.created_at}\n\n`;
                    });

                    await ctx.reply(templateList);
                    break;

                case 'send':
                    if (args.length < 2) {
                        await ctx.reply('❌ 请指定模板ID\n示例：/admin_broadcast send 1');
                        return;
                    }

                    const templateId = parseInt(args[1]);
                    if (isNaN(templateId)) {
                        await ctx.reply('❌ 模板ID必须是数字');
                        return;
                    }

                    await ctx.reply('📤 开始执行广播，请稍候...');

                    const result = await BroadcastService.executeBroadcast(templateId);
                    
                    await ctx.reply(`📊 广播执行完成

📈 统计信息：
• 目标群组：${result.totalGroups} 个
• 发送成功：${result.successCount} 个
• 发送失败：${result.failedCount} 个
• 成功率：${result.totalGroups > 0 ? Math.round((result.successCount / result.totalGroups) * 100) : 0}%`);
                    break;

                case 'stats':
                    const stats = await BroadcastService.getBroadcastStats();
                    await ctx.reply(`📊 广播统计信息

📤 总发送数：${stats.totalSent}
❌ 总失败数：${stats.totalFailed}
🚫 总阻止数：${stats.totalBlocked}
✅ 成功率：${stats.successRate}%`);
                    break;

                case 'groups':
                    const groups = await BroadcastService.getActiveChatGroups();
                    if (groups.length === 0) {
                        await ctx.reply('暂无活跃群组');
                        return;
                    }

                    let groupList = `👥 活跃群组列表 (${groups.length}个)：\n\n`;
                    groups.slice(0, 20).forEach(group => { // 只显示前20个
                        groupList += `🆔 ID: ${group.chat_id}\n`;
                        groupList += `📝 名称: ${group.title || '未知'}\n`;
                        groupList += `📊 类型: ${group.chat_type}\n`;
                        groupList += `📅 最后活跃: ${group.last_activity_at}\n\n`;
                    });

                    if (groups.length > 20) {
                        groupList += `...(还有 ${groups.length - 20} 个群组)`;
                    }

                    await ctx.reply(groupList);
                    break;

                default:
                    await ctx.reply('❌ 未知的操作，请使用 /admin_broadcast 查看帮助');
            }

        } catch (error) {
            logger.error('管理员广播命令失败:', error);
            await ctx.reply('❌ 命令执行失败，请稍后重试');
        }
    });

    logger.info('✅ 广播管理命令设置完成');
}