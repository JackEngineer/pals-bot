import { Telegraf } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { PointsService } from '../services/points-service';
import { UserService } from '../services/user-service';
import { 
    formatBottleMessage, 
    formatUserStats, 
    formatGlobalStats, 
    formatThrowSuccess, 
    formatReplySuccess, 
    formatHelpMessage 
} from '../utils/message-formatter';
import { logger } from '../utils/logger';
import { ExtendedContext, pendingReplies, currentlyViewing } from './command-state';
import { TelegramRetryHandler } from '../utils/telegram-retry';

export function setupBasicCommands(bot: Telegraf<ExtendedContext>) {
    // 开始命令
    bot.start(async (ctx) => {
        // 添加调试日志
        logger.info(`/start命令被调用: 用户${ctx.from?.id}, 聊天类型${ctx.chat.type}, 机器人用户名: ${ctx.botInfo?.username}`);
        
        await ctx.reply(
            `🌊 欢迎来到漂流瓶世界！\n\n` +
            `这里你可以:\n` +
            `📝 投放漂流瓶 - 分享你的心情和想法\n` +
            `🎣 捡拾漂流瓶 - 发现他人的故事\n` +
            `💬 回复漂流瓶 - 与陌生人交流\n` +
            `💰 积分系统 - 参与互动获得奖励\n\n` +
            `开始你的漂流瓶之旅吧！ 🚀\n\n` +
            `机器人用户名: @${ctx.botInfo?.username || '未知'}\n` +
            `当前聊天类型: ${ctx.chat.type}\n\n` +
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
                try {
                    const botInfo = await TelegramRetryHandler.executeWithRetry(
                        () => ctx.telegram.getMe(),
                        'getMe for throw command'
                    );
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
                } catch (error) {
                    logger.error('获取机器人信息失败:', error);
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `请私聊我来投放漂流瓶 💬`
                    );
                }
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
                try {
                    const botInfo = await TelegramRetryHandler.executeWithRetry(
                        () => ctx.telegram.getMe(),
                        'getMe for pick command'
                    );
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
                } catch (error) {
                    logger.error('获取机器人信息失败:', error);
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `请私聊我来捡拾漂流瓶 💬`
                    );
                }
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
                            { text: '🗑️ 丢弃', callback_data: `discard_${bottle.id}` }
                        ], [
                            { text: '🎣 继续捡拾', callback_data: 'pick_another' }
                        ]]
                    }
                }
            );

            // 保存当前正在查看的瓶子ID
            currentlyViewing.set(userId, bottle.id);

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
                try {
                    const botInfo = await TelegramRetryHandler.executeWithRetry(
                        () => ctx.telegram.getMe(),
                        'getMe for reply command'
                    );
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
                } catch (error) {
                    logger.error('获取机器人信息失败:', error);
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `请私聊我来回复漂流瓶 💬`
                    );
                }
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

    logger.info('✅ 基础漂流瓶命令设置完成');
} 