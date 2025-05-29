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

    // 发送互动选项按钮（好友申请 + 结束聊天）
    static async sendInteractionOptions(
        userId: number,
        sessionId: string,
        messageCount: number
    ) {
        const message = 
            `🎉 你们已经互动了 ${messageCount} 条消息！\n\n` +
            `看起来你们聊得很愉快，要不要进一步认识呢？\n` +
            `你可以申请添加对方为好友，或者结束这次聊天 💭`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '👫 申请添加好友', callback_data: `add_friend_${sessionId}` },
                { text: '👋 结束聊天', callback_data: `end_chat_${sessionId}` }
            ]]
        };

        return await this.sendMessage(userId, message, { reply_markup: replyMarkup });
    }

    // 发送好友互动选项按钮（查看资料 + 私聊 + 结束聊天）
    static async sendFriendInteractionOptions(
        userId: number,
        sessionId: string,
        messageCount: number,
        friendId: number
    ) {
        const message = 
            `🎉 你们已经互动了 ${messageCount} 条消息！\n\n` +
            `你们已经是好友了！可以选择查看对方资料或开启私聊 👫\n` +
            `也可以继续当前的匿名聊天或结束对话 💭`;

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '👤 查看好友资料', callback_data: `view_profile_${friendId}` },
                    { text: '💬 开启私聊', callback_data: `private_chat_${friendId}` }
                ],
                [
                    { text: '👋 结束聊天', callback_data: `end_chat_${sessionId}` }
                ]
            ]
        };

        return await this.sendMessage(userId, message, { reply_markup: replyMarkup });
    }

    // 发送好友申请通知
    static async sendFriendRequestNotification(
        targetUserId: number,
        requesterData: {
            requesterId: number;
            requesterUsername?: string;
            requestId: number;
            sessionId: string;
            message?: string;
        }
    ) {
        const requesterDisplay = '匿名朋友';
        
        let notificationMessage = 
            `💌 有人向你发送了好友申请！\n\n` +
            `👤 来自: ${requesterDisplay}\n` +
            `💬 来源: 匿名聊天\n`;

        if (requesterData.message) {
            notificationMessage += `📝 留言: ${requesterData.message}\n`;
        }

        notificationMessage += `\n你愿意成为朋友吗？`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '✅ 接受申请', callback_data: `accept_friend_${requesterData.requestId}` },
                { text: '❌ 礼貌拒绝', callback_data: `reject_friend_${requesterData.requestId}` }
            ]]
        };

        return await this.sendMessage(targetUserId, notificationMessage, { reply_markup: replyMarkup });
    }

    // 发送好友申请接受通知
    static async sendFriendRequestAcceptedNotification(
        userId: number,
        friendData: {
            friendId: number;
            friendUsername?: string;
        }
    ) {
        const friendDisplay = '匿名朋友';
        
        const message = 
            `🎉 ${friendDisplay} 接受了你的好友申请！\n\n` +
            `现在你们已经是好友了，可以查看对方的基本信息\n` +
            `点击下方按钮开始私聊吧！ ✨`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '💬 去私聊', callback_data: `private_chat_${friendData.friendId}` },
                { text: '👤 查看资料', callback_data: `view_profile_${friendData.friendId}` }
            ]]
        };

        return await this.sendMessage(userId, message, { reply_markup: replyMarkup });
    }

    // 发送好友申请拒绝通知
    static async sendFriendRequestRejectedNotification(
        userId: number,
        targetUserName?: string
    ) {
        const targetDisplay = '对方';
        
        const message = 
            `😔 ${targetDisplay} 暂时不想添加好友\n\n` +
            `没关系，继续保持这份美好的匿名友谊吧！\n` +
            `或者继续探索更多漂流瓶 🌊`;

        return await this.sendMessage(userId, message);
    }

    // 发送好友申请已发送确认
    static async sendFriendRequestSentConfirmation(
        userId: number,
        targetUserName?: string
    ) {
        const targetDisplay = '对方';
        
        const message = 
            `💌 好友申请已发送给 ${targetDisplay}！\n\n` +
            `请耐心等待回复，我会第一时间通知你结果 ✨\n` +
            `在此期间，你们还可以继续愉快聊天～`;

        return await this.sendMessage(userId, message);
    }

    // 发送私聊开始通知
    static async sendPrivateChatStartNotification(
        userId: number,
        friendData: {
            friendId: number;
            friendUsername?: string;
            friendDisplayName?: string;
        }
    ) {
        const friendDisplay = friendData.friendDisplayName || friendData.friendUsername || `用户 ${friendData.friendId}`;
        
        const message = 
            `💬 私聊已开启！\n\n` +
            `现在你正在与 ${friendDisplay} 私聊\n` +
            `消息将直接发送给对方，不再通过机器人中转\n` +
            `点击 @${friendData.friendUsername || 'telegram_user'} 开始对话吧！`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '📱 打开私聊', url: `tg://user?id=${friendData.friendId}` }
            ]]
        };

        return await this.sendMessage(userId, message, { reply_markup: replyMarkup });
    }

    // 显示用户资料
    static async sendUserProfile(
        userId: number,
        profileData: {
            friendId: number;
            friendUsername?: string;
            friendDisplayName?: string;
            addedDate: string;
        }
    ) {
        const friendDisplay = profileData.friendDisplayName || profileData.friendUsername || `用户 ${profileData.friendId}`;
        
        const message = 
            `👤 好友资料\n\n` +
            `🏷️ 昵称: ${friendDisplay}\n` +
            `🆔 用户ID: ${profileData.friendId}\n` +
            `📅 成为好友: ${profileData.addedDate}\n` +
            `💭 来源: 漂流瓶匿名聊天`;

        const replyMarkup = {
            inline_keyboard: [[
                { text: '💬 私聊', callback_data: `private_chat_${profileData.friendId}` },
                { text: '❌ 删除好友', callback_data: `remove_friend_${profileData.friendId}` }
            ]]
        };

        return await this.sendMessage(userId, message, { reply_markup: replyMarkup });
    }
}

export { NotificationService }; 