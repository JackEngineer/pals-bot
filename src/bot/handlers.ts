import { Telegraf, Context } from 'telegraf';
import { BottleService } from '../services/bottle-service';
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

    logger.info('✅ 漂流瓶消息处理器设置完成');
} 