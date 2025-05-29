import { Telegraf, Context } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { BroadcastService } from '../services/broadcast-service';
import { formatThrowSuccess } from '../utils/message-formatter';
import { logger } from '../utils/logger';

export function setupHandlers(bot: Telegraf<Context>) {
    // 处理文字消息作为漂流瓶
    bot.on('text', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            const text = ctx.message.text;
            
            if (!userId) {
                return;
            }

            // 跳过命令消息
            if (text.startsWith('/')) {
                return;
            }

            // 检查是否是群组消息，如果是群组消息则忽略
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            if (isGroupMessage) {
                return; // 群组中的所有非命令消息都忽略
            }

            // 检查是否启用媒体漂流瓶 - 默认禁用，只有明确设置为 'true' 才启用
            const enableMediaBottles = process.env.ENABLE_MEDIA_BOTTLES === 'true';
            if (!enableMediaBottles) {
                await ctx.reply('📝 请使用 /throw 命令投放漂流瓶\n\n💡 示例：/throw 你好，这是我的第一个漂流瓶！');
                return;
            }

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content: text
            });

            await ctx.reply(formatThrowSuccess(bottleId, text));

        } catch (error) {
            logger.error('处理文字消息失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 处理图片消息 - 也需要使用命令
    bot.on('photo', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                return;
            }

            // 检查是否是群组消息，如果是群组消息则忽略
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            if (isGroupMessage) {
                return; // 群组中的图片消息都忽略
            }

            // 检查是否启用媒体漂流瓶
            const enableMediaBottles = process.env.ENABLE_MEDIA_BOTTLES === 'true';
            if (!enableMediaBottles) {
                await ctx.reply('📸 请使用 /throw 命令投放图片漂流瓶\n\n💡 示例：先发送 /throw，然后发送图片');
                return;
            }

            const username = ctx.from?.username;
            const caption = ctx.message.caption || '📷 图片';
            const photo = ctx.message.photo[ctx.message.photo.length - 1]; // 获取最大尺寸的图片

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content: caption,
                mediaType: 'photo',
                mediaFileId: photo.file_id
            });

            await ctx.reply(formatThrowSuccess(bottleId, caption));

        } catch (error) {
            logger.error('处理图片消息失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 处理语音消息 - 也需要使用命令
    bot.on('voice', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                return;
            }

            // 检查是否是群组消息，如果是则忽略
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            if (isGroupMessage) {
                return; // 群组中的语音消息不处理
            }

            // 检查是否启用媒体漂流瓶
            const enableMediaBottles = process.env.ENABLE_MEDIA_BOTTLES === 'true';
            if (!enableMediaBottles) {
                await ctx.reply('🎵 请使用 /throw 命令投放语音漂流瓶\n\n💡 示例：先发送 /throw，然后发送语音');
                return;
            }

            const username = ctx.from?.username;
            const content = '🎵 语音消息';

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content,
                mediaType: 'voice',
                mediaFileId: ctx.message.voice.file_id
            });

            await ctx.reply(formatThrowSuccess(bottleId, content));

        } catch (error) {
            logger.error('处理语音消息失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 处理视频消息 - 也需要使用命令
    bot.on('video', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                return;
            }

            // 检查是否是群组消息，如果是群组消息则忽略
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            if (isGroupMessage) {
                return; // 群组中的视频消息都忽略
            }

            // 检查是否启用媒体漂流瓶
            const enableMediaBottles = process.env.ENABLE_MEDIA_BOTTLES === 'true';
            if (!enableMediaBottles) {
                await ctx.reply('🎬 请使用 /throw 命令投放视频漂流瓶\n\n💡 示例：先发送 /throw，然后发送视频');
                return;
            }

            const username = ctx.from?.username;
            const caption = ctx.message.caption || '🎬 视频';

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content: caption,
                mediaType: 'video',
                mediaFileId: ctx.message.video.file_id
            });

            await ctx.reply(formatThrowSuccess(bottleId, caption));

        } catch (error) {
            logger.error('处理视频消息失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 处理文档消息 - 也需要使用命令
    bot.on('document', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                return;
            }

            // 检查是否是群组消息，如果是群组消息则忽略
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            if (isGroupMessage) {
                return; // 群组中的文档消息都忽略
            }

            // 检查是否启用媒体漂流瓶
            const enableMediaBottles = process.env.ENABLE_MEDIA_BOTTLES === 'true';
            if (!enableMediaBottles) {
                await ctx.reply('📄 请使用 /throw 命令投放文档漂流瓶\n\n💡 示例：先发送 /throw，然后发送文档');
                return;
            }

            const username = ctx.from?.username;
            const caption = ctx.message.caption || `📄 文档: ${ctx.message.document.file_name || '未知文件'}`;

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content: caption,
                mediaType: 'document',
                mediaFileId: ctx.message.document.file_id
            });

            await ctx.reply(formatThrowSuccess(bottleId, caption));

        } catch (error) {
            logger.error('处理文档消息失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 处理不支持的消息类型
    bot.on('message', async (ctx) => {
        // 如果消息已经被上面的处理器处理过，就不会到达这里
        if ('text' in ctx.message || 'photo' in ctx.message || 'voice' in ctx.message || 
            'video' in ctx.message || 'document' in ctx.message) {
            return;
        }

        // 检查是否是群组消息，如果是群组消息则不回复
        const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
        if (isGroupMessage) {
            return;
        }

        await ctx.reply(
            '❌ 暂不支持此类型的消息作为漂流瓶\n\n' +
            '支持的类型:\n' +
            '• 文字消息 (需使用 /throw 命令)\n' +
            '• 图片\n' +
            '• 语音\n' +
            '• 视频\n' +
            '• 文档\n\n' +
            '请使用 /help 查看帮助'
        );
    });

    logger.info('✅ 所有消息处理器设置完成');

    // 设置群组相关事件处理
    setupGroupEventHandlers(bot);
}

// 设置群组相关事件处理
function setupGroupEventHandlers(bot: Telegraf<Context>) {
    // 机器人被添加到群组或频道
    bot.on('my_chat_member', async (ctx) => {
        try {
            const newStatus = ctx.myChatMember.new_chat_member.status;
            const oldStatus = ctx.myChatMember.old_chat_member.status;
            
            if (newStatus === 'member' || newStatus === 'administrator') {
                // 机器人被添加到群组
                logger.info(`机器人被添加到群组: ${ctx.chat.id}`);
                await BroadcastService.registerChatGroup(ctx);
                
                // 💡 如需关闭广播，管理员可以使用 /broadcast_off 命令
                // 如需重新开启，可以使用 /broadcast_on 命令
                // 发送欢迎消息
                const welcomeMessage = `🎉 感谢邀请漂流瓶机器人加入群组！

🌊 我是一个漂流瓶机器人，可以帮助群组成员：
• 分享有趣的漂流瓶消息
• 获取定期的活动推广信息
• 了解机器人的最新功能

📢 本群组已启用广播功能，会定期收到精选内容推送

🎯 开始你的漂流瓶之旅，点击下方按钮与机器人私聊：`;

                try {
                    await ctx.reply(welcomeMessage, {
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '💬 私聊机器人',
                                    url: `https://t.me/${ctx.botInfo.username}`
                                }
                            ]]
                        }
                    });
                } catch (error) {
                    logger.warn('发送群组欢迎消息失败:', error);
                }
                
            } else if (newStatus === 'left' || newStatus === 'kicked') {
                // 机器人被移除
                logger.info(`机器人被移除出群组: ${ctx.chat.id}`);
                await BroadcastService.markBotLeft(ctx.chat.id);
            }
        } catch (error) {
            logger.error('处理群组成员变更事件失败:', error);
        }
    });

    // 机器人被添加到群组（旧版事件，兼容性）
    bot.on('new_chat_members', async (ctx) => {
        try {
            const botId = ctx.botInfo.id;
            const newMembers = ctx.message.new_chat_members;
            
            // 检查是否包含机器人自己
            const botAdded = newMembers?.some(member => member.id === botId);
            
            if (botAdded) {
                logger.info(`机器人通过new_chat_members被添加到群组: ${ctx.chat.id}`);
                await BroadcastService.registerChatGroup(ctx);
            }
        } catch (error) {
            logger.error('处理new_chat_members事件失败:', error);
        }
    });

    // 机器人被移除出群组（旧版事件，兼容性）
    bot.on('left_chat_member', async (ctx) => {
        try {
            const botId = ctx.botInfo.id;
            const leftMember = ctx.message.left_chat_member;
            
            if (leftMember.id === botId) {
                logger.info(`机器人通过left_chat_member被移除出群组: ${ctx.chat.id}`);
                await BroadcastService.markBotLeft(ctx.chat.id);
            }
        } catch (error) {
            logger.error('处理left_chat_member事件失败:', error);
        }
    });

    // 监听群组中的任何消息，以更新活跃时间
    bot.use(async (ctx, next) => {
        try {
            // 仅处理群组消息
            if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
                // 更新群组活跃时间
                await BroadcastService.registerChatGroup(ctx);
            }
        } catch (error) {
            logger.error('更新群组活跃时间失败:', error);
        }
        
        return next();
    });

    logger.info('✅ 群组事件处理器设置完成');
} 