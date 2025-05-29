import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';

class NotificationService {
    private static bot: Telegraf | null = null;

    // 设置bot实例
    static setBotInstance(bot: Telegraf) {
        this.bot = bot;
        logger.info('✅ 通知服务已连接bot实例');
    }

    // 发送文本消息
    static async sendMessage(userId: number, message: string, options: any = {}) {
        if (!this.bot) {
            logger.error('Bot实例未设置，无法发送通知');
            return false;
        }

        try {
            await this.bot.telegram.sendMessage(userId, message, options);
            logger.info(`通知发送成功: 用户${userId}`);
            return true;
        } catch (error) {
            logger.error(`发送通知失败: 用户${userId}`, error);
            return false;
        }
    }

    // 发送图片消息
    static async sendPhoto(userId: number, photo: string, caption?: string, options: any = {}) {
        if (!this.bot) {
            logger.error('Bot实例未设置，无法发送通知');
            return false;
        }

        try {
            await this.bot.telegram.sendPhoto(userId, photo, { caption, ...options });
            logger.info(`图片通知发送成功: 用户${userId}`);
            return true;
        } catch (error) {
            logger.error(`发送图片通知失败: 用户${userId}`, error);
            return false;
        }
    }

    // 发送语音消息
    static async sendVoice(userId: number, voice: string, options: any = {}) {
        if (!this.bot) {
            logger.error('Bot实例未设置，无法发送通知');
            return false;
        }

        try {
            await this.bot.telegram.sendVoice(userId, voice, options);
            logger.info(`语音通知发送成功: 用户${userId}`);
            return true;
        } catch (error) {
            logger.error(`发送语音通知失败: 用户${userId}`, error);
            return false;
        }
    }

    // 发送视频消息
    static async sendVideo(userId: number, video: string, caption?: string, options: any = {}) {
        if (!this.bot) {
            logger.error('Bot实例未设置，无法发送通知');
            return false;
        }

        try {
            await this.bot.telegram.sendVideo(userId, video, { caption, ...options });
            logger.info(`视频通知发送成功: 用户${userId}`);
            return true;
        } catch (error) {
            logger.error(`发送视频通知失败: 用户${userId}`, error);
            return false;
        }
    }

    // 发送文档消息
    static async sendDocument(userId: number, document: string, caption?: string, options: any = {}) {
        if (!this.bot) {
            logger.error('Bot实例未设置，无法发送通知');
            return false;
        }

        try {
            await this.bot.telegram.sendDocument(userId, document, { caption, ...options });
            logger.info(`文档通知发送成功: 用户${userId}`);
            return true;
        } catch (error) {
            logger.error(`发送文档通知失败: 用户${userId}`, error);
            return false;
        }
    }

    // 发送漂流瓶回复通知
    static async sendBottleReplyNotification(
        originalAuthorId: number,
        replyData: {
            bottleId: string;
            replyContent: string;
            replierUsername?: string;
            replierId: number;
            mediaType?: 'photo' | 'voice' | 'video' | 'document';
            mediaFileId?: string;
        }
    ) {
        // const replierDisplay = replyData.replierUsername ? `@${replyData.replierUsername}` : '匿名用户';
        const replierDisplay = '匿名用户';
        
        // 构建通知消息
        let notificationMessage = 
            `🎉 你的漂流瓶收到了新回复！\n\n` +
            `💬 回复内容: ${replyData.replyContent}\n` +
            `👤 来自: ${replierDisplay}\n` +
            `🆔 瓶子编号: ${replyData.bottleId.slice(-8)}\n\n` +
            `💰 奖励: +3积分\n\n` +
            `你可以选择与这位朋友进一步交流，或者忽略这次回复 💭`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '💬 发起聊天', callback_data: `start_chat_${replyData.bottleId}_${replyData.replierId}` },
                { text: '🙈 忽略', callback_data: `ignore_reply_${replyData.bottleId}` }
            ]]
        };

        // 根据媒体类型发送不同的消息
        if (replyData.mediaType && replyData.mediaFileId) {
            switch (replyData.mediaType) {
                case 'photo':
                    return await this.sendPhoto(
                        originalAuthorId, 
                        replyData.mediaFileId, 
                        notificationMessage, 
                        { reply_markup: replyMarkup }
                    );
                case 'voice':
                    // 语音消息需要先发送语音，再发送文本通知
                    await this.sendVoice(originalAuthorId, replyData.mediaFileId);
                    return await this.sendMessage(originalAuthorId, notificationMessage, { reply_markup: replyMarkup });
                case 'video':
                    return await this.sendVideo(
                        originalAuthorId, 
                        replyData.mediaFileId, 
                        notificationMessage, 
                        { reply_markup: replyMarkup }
                    );
                case 'document':
                    return await this.sendDocument(
                        originalAuthorId, 
                        replyData.mediaFileId, 
                        notificationMessage, 
                        { reply_markup: replyMarkup }
                    );
                default:
                    return await this.sendMessage(originalAuthorId, notificationMessage, { reply_markup: replyMarkup });
            }
        } else {
            return await this.sendMessage(originalAuthorId, notificationMessage, { reply_markup: replyMarkup });
        }
    }

    // 发送聊天邀请通知
    static async sendChatInviteNotification(
        targetUserId: number,
        initiatorData: {
            initiatorId: number;
            initiatorUsername?: string;
            bottleId: string;
        }
    ) {
        // const initiatorDisplay = initiatorData.initiatorUsername ? `@${initiatorData.initiatorUsername}` : '匿名用户';
        const initiatorDisplay = '匿名用户';
        
        const message = 
            `💌 有人想要和你聊天！\n\n` +
            `👤 来自: ${initiatorDisplay}\n` +
            `📝 关于漂流瓶: #${initiatorData.bottleId.slice(-8)}\n\n` +
            `你愿意开始一段新的对话吗？`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '✅ 接受聊天', callback_data: `accept_chat_${initiatorData.bottleId}_${initiatorData.initiatorId}` },
                { text: '❌ 礼貌拒绝', callback_data: `decline_chat_${initiatorData.bottleId}_${initiatorData.initiatorId}` }
            ]]
        };

        return await this.sendMessage(targetUserId, message, { reply_markup: replyMarkup });
    }

    // 发送聊天接受通知
    static async sendChatAcceptedNotification(userId: number, otherUserName?: string) {
        // const otherUserDisplay = otherUserName ? `@${otherUserName}` : '匿名用户';
        const otherUserDisplay = '匿名用户';
        
        const message = 
            `🎉 ${otherUserDisplay} 接受了你的聊天邀请！\n\n` +
            `💬 现在你们可以通过机器人进行匿名聊天了\n` +
            `📝 直接发送消息，我会转发给对方\n` +
            `🔚 发送 /endchat 结束聊天\n\n` +
            `开始你们的对话吧～ ✨`;

        return await this.sendMessage(userId, message);
    }

    // 发送聊天拒绝通知
    static async sendChatDeclinedNotification(userId: number, otherUserName?: string) {
        // const otherUserDisplay = otherUserName ? `@${otherUserName}` : '匿名用户';
        const otherUserDisplay = '匿名用户';
        
        const message = 
            `😔 ${otherUserDisplay} 暂时不想聊天\n\n` +
            `不要灰心，海上还有很多漂流瓶等着你去发现！\n` +
            `继续你的漂流瓶之旅吧 🌊`;

        return await this.sendMessage(userId, message);
    }

    // 转发聊天消息
    static async forwardChatMessage(
        targetUserId: number,
        senderName: string,
        messageContent: string,
        mediaType?: 'photo' | 'voice' | 'video' | 'document',
        mediaFileId?: string
    ) {
        const messagePrefix = `TA 说:\n`;
        
        if (mediaType && mediaFileId) {
            switch (mediaType) {
                case 'photo':
                    return await this.sendPhoto(targetUserId, mediaFileId, messagePrefix + messageContent);
                case 'voice':
                    await this.sendVoice(targetUserId, mediaFileId);
                    return await this.sendMessage(targetUserId, messagePrefix + '[语音消息]');
                case 'video':
                    return await this.sendVideo(targetUserId, mediaFileId, messagePrefix + messageContent);
                case 'document':
                    return await this.sendDocument(targetUserId, mediaFileId, messagePrefix + messageContent);
                default:
                    return await this.sendMessage(targetUserId, messagePrefix + messageContent);
            }
        } else {
            return await this.sendMessage(targetUserId, messagePrefix + messageContent);
        }
    }
}

export { NotificationService }; 