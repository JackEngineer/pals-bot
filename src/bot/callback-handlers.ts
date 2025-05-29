import { Telegraf } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { ChatService } from '../services/chat-service';
import { NotificationService } from '../services/notification-service';
import { FriendService } from '../services/friend-service';
import { formatBottleMessage } from '../utils/message-formatter';
import { logger } from '../utils/logger';
import { ExtendedContext, pendingReplies, currentlyViewing } from './command-state';

export function setupCallbackHandlers(bot: Telegraf<ExtendedContext>) {
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
                // 清理当前查看状态
                currentlyViewing.delete(userId);
                return;
            }

            // 丢弃漂流瓶按钮
            if (callbackData.startsWith('discard_')) {
                const bottleId = callbackData.replace('discard_', '');
                
                try {
                    await BottleService.discardBottle(userId, bottleId);
                    
                    await ctx.answerCbQuery('🗑️ 瓶子已丢弃');
                    
                    // 编辑原消息，移除按钮
                    await ctx.editMessageReplyMarkup({
                        inline_keyboard: []
                    });
                    
                    await ctx.reply(
                        `🗑️ 瓶子已丢弃\n\n` +
                        `瓶子 #${bottleId.slice(-8)} 已被丢弃，它会重新回到大海中\n` +
                        `你将不会再次捡到这个瓶子\n\n` +
                        `想要继续捡拾其他瓶子吗？`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🎣 继续捡拾', callback_data: 'pick_another' }
                                ]]
                            }
                        }
                    );
                    
                } catch (error) {
                    await ctx.answerCbQuery('❌ 丢弃失败');
                    await ctx.reply(`❌ 丢弃失败: ${(error as Error).message}`);
                }
                
                // 清理当前查看状态
                currentlyViewing.delete(userId);
                return;
            }

            // 继续捡拾按钮（修改逻辑：也会丢弃当前瓶子）
            if (callbackData === 'pick_another') {
                await ctx.answerCbQuery();
                
                // 编辑原消息，移除按钮
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: []
                });

                // 先丢弃当前正在查看的瓶子（如果有的话）
                const currentBottleId = currentlyViewing.get(userId);
                if (currentBottleId) {
                    try {
                        await BottleService.discardBottle(userId, currentBottleId);
                        currentlyViewing.delete(userId);
                    } catch (error) {
                        // 丢弃失败不影响继续捡拾，可能瓶子已经被处理过了
                        logger.warn(`自动丢弃瓶子失败: ${(error as Error).message}`);
                        currentlyViewing.delete(userId);
                    }
                }
                
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
                                { text: '🗑️ 丢弃', callback_data: `discard_${bottle.id}` }
                            ], [
                                { text: '🎣 继续捡拾', callback_data: 'pick_another' }
                            ]]
                        }
                    }
                );

                // 保存当前正在查看的瓶子ID
                currentlyViewing.set(userId, bottle.id);
                
                return;
            }

            await ctx.answerCbQuery('❌ 未知的操作');

        } catch (error) {
            logger.error('处理回调查询失败:', error);
            await ctx.answerCbQuery('❌ 操作失败，请稍后重试');
        }
    });

    logger.info('✅ 回调查询处理器设置完成');
} 