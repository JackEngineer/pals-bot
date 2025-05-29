import { Telegraf } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { ChatService } from '../services/chat-service';
import { FriendService } from '../services/friend-service';
import { NotificationService } from '../services/notification-service';
import { UserService } from '../services/user-service';
import { formatReplySuccess } from '../utils/message-formatter';
import { logger } from '../utils/logger';
import { ExtendedContext, pendingReplies, shownFriendButtons } from './command-state';

export function setupMessageHandlers(bot: Telegraf<ExtendedContext>) {
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

    logger.info('✅ 消息处理中间件设置完成');
} 