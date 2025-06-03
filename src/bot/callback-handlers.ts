import { Telegraf } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { ChatService } from '../services/chat-service';
import { NotificationService } from '../services/notification-service';
import { FriendService } from '../services/friend-service';
import { formatBottleMessage } from '../utils/message-formatter';
import { logger } from '../utils/logger';
import { ExtendedContext, pendingReplies, currentlyViewing } from './command-state';
import { PointsService } from '../services/points-service';
import { TelegramRetryHandler } from '../utils/telegram-retry';

/**
 * 安全回答回调查询，处理超时错误
 */
async function safeAnswerCbQuery(ctx: ExtendedContext, text?: string): Promise<void> {
    const success = await TelegramRetryHandler.safeAnswerCbQuery(ctx, text);
    if (!success) {
        logger.warn(`回调查询回答失败: 用户${ctx.from?.id}, 文本: ${text}`);
    }
}

/**
 * 安全编辑消息回复标记，处理消息编辑失败的情况
 */
async function safeEditMessageReplyMarkup(ctx: ExtendedContext, replyMarkup: any): Promise<void> {
    const success = await TelegramRetryHandler.safeEditMessageReplyMarkup(ctx, replyMarkup);
    if (!success) {
        logger.warn(`消息标记编辑失败: 用户${ctx.from?.id}`);
    }
}

/**
 * 安全发送消息，带重试机制
 */
async function safeReply(ctx: ExtendedContext, message: string, options: any = {}): Promise<boolean> {
    return await TelegramRetryHandler.safeReply(ctx, message, options);
}

export function setupCallbackHandlers(bot: Telegraf<ExtendedContext>) {
    // 处理回调查询（按钮点击）
    bot.on('callback_query', async (ctx) => {
        try {
            // 类型断言以访问 data 属性
            const callbackQuery = ctx.callbackQuery as any;
            const callbackData = callbackQuery.data;
            
            if (!callbackData) {
                await safeAnswerCbQuery(ctx, '❌ 无效的操作');
                return;
            }

            const userId = ctx.from?.id;
            const username = ctx.from?.username;

            if (!userId) {
                await safeAnswerCbQuery(ctx, '❌ 无法获取用户信息');
                return;
            }

            // 发起聊天按钮
            if (callbackData.startsWith('start_chat_')) {
                const parts = callbackData.split('_');
                const bottleId = parts[2];
                const replierId = parseInt(parts[3]);
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                await safeAnswerCbQuery(ctx, '已忽略这次回复');
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                
                await safeAnswerCbQuery(ctx);
                
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
                
                await safeAnswerCbQuery(ctx);
                
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
                
                await safeAnswerCbQuery(ctx);
                
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
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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
                    
                    await safeAnswerCbQuery(ctx, '🗑️ 瓶子已丢弃');
                    
                    // 编辑原消息，移除按钮
                    await safeEditMessageReplyMarkup(ctx, {
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
                    await safeAnswerCbQuery(ctx, '❌ 丢弃失败');
                    await ctx.reply(`❌ 丢弃失败: ${(error as Error).message}`);
                }
                
                // 清理当前查看状态
                currentlyViewing.delete(userId);
                return;
            }

            // 继续捡拾按钮（修改逻辑：也会丢弃当前瓶子）
            if (callbackData === 'pick_another') {
                await safeAnswerCbQuery(ctx);
                
                // 编辑原消息，移除按钮
                await safeEditMessageReplyMarkup(ctx, {
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

                // 显示正在捡拾的提示
                const loadingSuccess = await safeReply(ctx, '🌊 正在大海中搜寻漂流瓶...');
                
                if (!loadingSuccess) {
                    // 网络连接失败，告知用户
                    await safeReply(ctx, '❌ 网络连接不稳定，请稍后重试捡拾漂流瓶');
                    return;
                }
                
                // 自动执行捡拾命令
                let bottle;
                try {
                    bottle = await BottleService.pickBottle(userId);
                } catch (error) {
                    logger.error('捡拾漂流瓶失败:', error);
                    await safeReply(ctx, '❌ 捡拾漂流瓶时发生错误，请稍后重试');
                    return;
                }
                
                if (!bottle) {
                    // 🆕 获取用户等级信息以提供个性化的失败提示
                    try {
                        const userPoints = await PointsService.getUserPoints(userId);
                        const userLevel = userPoints.level;
                        const levelName = userPoints.level_name;

                        // 根据等级给出不同的鼓励信息
                        let encouragementMessage = '';
                        if (userLevel === 1) {
                            encouragementMessage = '🌱 新手水手的海洋探索之路才刚刚开始！\n提升等级可以增加捡到瓶子的概率哦～';
                        } else if (userLevel === 2) {
                            encouragementMessage = '⚓ 见习船员继续努力！\n你的捡拾技能正在提升中～';
                        } else if (userLevel === 3) {
                            encouragementMessage = '🚢 资深航海者运气不佳，但经验丰富！\n再试几次一定能捡到好瓶子～';
                        } else if (userLevel === 4) {
                            encouragementMessage = '🏴‍☠️ 海洋探索家暂时空手而归...\n不过凭你的实力，下次一定能有收获！';
                        } else {
                            encouragementMessage = '👑 漂流瓶大师偶尔也会遇到波涛汹涌的时候～\n坚持下去，传说中的珍稀瓶子在等着你！';
                        }

                        const failMessage = `🌊 这次又没有捡到漂流瓶...\n\n` +
                            `${encouragementMessage}\n\n` +
                            `🏆 你的等级: ${levelName}\n` +
                            `💡 获得安慰奖: +1积分\n\n` +
                            `💪 想要提高成功率吗？\n` +
                            `• 🔄 继续投放和回复瓶子提升等级\n` +
                            `• 🛒 在商店购买🍀幸运加成道具\n` +
                            `• 💎 成为VIP会员享受概率加成`;

                        const replySuccess = await safeReply(ctx, failMessage, {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '🎣 再试一次', callback_data: 'pick_another' },
                                        { text: '🛒 查看商店', callback_data: 'show_shop' }
                                    ],
                                    [
                                        { text: '📝 投放瓶子', callback_data: 'show_throw' },
                                        { text: '📊 查看等级', callback_data: 'show_points' }
                                    ]
                                ]
                            }
                        });

                        if (!replySuccess) {
                            // 如果回复失败，尝试发送简化版本
                            await safeReply(ctx, '🌊 这次没有捡到漂流瓶，获得安慰奖 +1积分。网络不稳定，请稍后重试。');
                        }
                    } catch (error) {
                        logger.error('获取用户信息失败:', error);
                        await safeReply(ctx, '🌊 这次没有捡到漂流瓶，获得安慰奖 +1积分');
                    }
                    return;
                }

                const message = formatBottleMessage(bottle);
                
                // 如果有媒体文件，先发送媒体
                let mediaSuccess = true;
                if (bottle.media_file_id && bottle.media_type) {
                    switch (bottle.media_type) {
                        case 'photo':
                            mediaSuccess = await TelegramRetryHandler.safeReplyWithPhoto(ctx, bottle.media_file_id, { caption: message });
                            break;
                        case 'voice':
                            mediaSuccess = await TelegramRetryHandler.safeReplyWithVoice(ctx, bottle.media_file_id);
                            if (mediaSuccess) {
                                mediaSuccess = await safeReply(ctx, message);
                            }
                            break;
                        case 'video':
                            mediaSuccess = await TelegramRetryHandler.safeReplyWithVideo(ctx, bottle.media_file_id, { caption: message });
                            break;
                        case 'document':
                            mediaSuccess = await TelegramRetryHandler.safeReplyWithDocument(ctx, bottle.media_file_id, { caption: message });
                            break;
                        default:
                            mediaSuccess = await safeReply(ctx, message);
                    }
                } else {
                    mediaSuccess = await safeReply(ctx, message);
                }

                if (!mediaSuccess) {
                    await safeReply(ctx, '❌ 网络连接不稳定，瓶子内容发送失败。请稍后重试。');
                    return;
                }

                // 提示可以回复
                const promptSuccess = await safeReply(ctx, `💬 想要回复这个漂流瓶吗？`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '💬 回复漂流瓶', callback_data: `reply_${bottle.id}` },
                            { text: '🗑️ 丢弃', callback_data: `discard_${bottle.id}` }
                        ], [
                            { text: '🎣 继续捡拾', callback_data: 'pick_another' }
                        ]]
                    }
                });

                if (promptSuccess) {
                    // 保存当前正在查看的瓶子ID
                    currentlyViewing.set(userId, bottle.id);
                } else {
                    logger.warn(`发送回复提示失败: 用户${userId}, 瓶子${bottle.id}`);
                }
                
                return;
            }

            // 🆕 显示商店按钮
            if (callbackData === 'show_shop') {
                await safeAnswerCbQuery(ctx);
                
                try {
                    const userPoints = await PointsService.getUserPoints(userId);
                    const items = await PointsService.getShopItems(undefined, userPoints.level);
                    
                    if (items.length === 0) {
                        await ctx.reply('🛒 积分商店暂时没有适合你等级的商品');
                        return;
                    }

                    let message = `🛒 积分商店\n`;
                    message += `💰 你的积分: ${userPoints.available_points}\n`;
                    message += `🏆 你的等级: ${userPoints.level_name}\n\n`;
                    
                    // 只显示特权类商品（简化显示）
                    const privilegeItems = items.filter(item => item.category === 'privilege').slice(0, 4);
                    if (privilegeItems.length > 0) {
                        message += `🔥 热门特权商品:\n`;
                        privilegeItems.forEach(item => {
                            const canAfford = userPoints.available_points >= item.price ? '✅' : '❌';
                            message += `${canAfford} ${item.name} - ${item.price}积分\n`;
                            message += `   ${item.description}\n`;
                            if (item.duration_days) {
                                message += `   ⏰ 有效期: ${item.duration_days}天\n`;
                            }
                            message += `   /buy ${item.id}\n\n`;
                        });
                    }

                    message += `💡 使用 /shop 查看完整商店\n使用 /buy <商品ID> 来购买商品`;

                    await ctx.reply(message);
                } catch (error) {
                    logger.error('显示商店失败:', error);
                    await ctx.reply('❌ 获取商店信息失败，请稍后重试');
                }
                
                return;
            }

            // 🆕 显示积分信息按钮
            if (callbackData === 'show_points') {
                await safeAnswerCbQuery(ctx);
                
                try {
                    const [userPoints, recentTransactions, privileges] = await Promise.all([
                        PointsService.getUserPoints(userId),
                        PointsService.getUserTransactions(userId, 5),
                        BottleService.getUserPrivileges(userId)
                    ]);

                    let message = `💰 你的积分信息\n\n`;
                    message += `🏆 等级: ${userPoints.level_name} (Lv.${userPoints.level})\n`;
                    message += `💎 总积分: ${userPoints.total_points}\n`;
                    message += `💰 可用积分: ${userPoints.available_points}\n`;
                    message += `🔥 连续签到: ${userPoints.daily_checkin_streak} 天\n`;

                    // 🆕 显示捡瓶子成功概率
                    const baseProbabilityConfig = {
                        1: 60, // 新手水手 - 60%
                        2: 70, // 见习船员 - 70%
                        3: 78, // 资深航海者 - 78%
                        4: 85, // 海洋探索家 - 85%
                        5: 90  // 漂流瓶大师 - 90%
                    };
                    
                    let pickProbability = baseProbabilityConfig[userPoints.level as keyof typeof baseProbabilityConfig] || 60;
                    
                    // 计算加成
                    if (privileges.hasLuckyBoost) pickProbability += 10;
                    if (privileges.isVip) pickProbability += 3;
                    pickProbability = Math.min(pickProbability, 95);
                    
                    message += `🎣 捡瓶成功率: ${pickProbability}%\n`;

                    // 显示特权状态
                    const activePrivileges = [];
                    if (privileges.isVip) activePrivileges.push('💎VIP会员');
                    if (privileges.hasExtraThrows) activePrivileges.push('📝额外投放');
                    if (privileges.hasDoublePoints) activePrivileges.push('💫双倍积分');
                    if (privileges.hasLuckyBoost) activePrivileges.push('🍀幸运加成');

                    if (activePrivileges.length > 0) {
                        message += `\n🎯 活跃特权: ${activePrivileges.join(', ')}\n`;
                    }

                    message += `\n💡 使用 /points 查看详细信息`;

                    await ctx.reply(message);
                } catch (error) {
                    logger.error('显示积分信息失败:', error);
                    await ctx.reply('❌ 获取积分信息失败，请稍后重试');
                }
                
                return;
            }

            // 🆕 显示投放瓶子按钮
            if (callbackData === 'show_throw') {
                await safeAnswerCbQuery(ctx);
                
                await ctx.reply(
                    `📝 投放漂流瓶\n\n` +
                    `有什么想要分享的心情吗？\n` +
                    `直接发送文字、图片、语音或视频给我，\n` +
                    `我会帮你制作成漂流瓶投放到大海中！\n\n` +
                    `💡 或者使用命令: /throw <你的内容>`
                );
                
                return;
            }

            await safeAnswerCbQuery(ctx, '❌ 未知的操作');

        } catch (error) {
            logger.error('处理回调查询失败:', error);
            await safeAnswerCbQuery(ctx, '❌ 操作失败，请稍后重试');
        }
    });

    logger.info('✅ 回调查询处理器设置完成');
} 