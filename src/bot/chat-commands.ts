import { Telegraf } from 'telegraf';
import { ChatService } from '../services/chat-service';
import { FriendService } from '../services/friend-service';
import { NotificationService } from '../services/notification-service';
import { logger } from '../utils/logger';
import { ExtendedContext, shownFriendButtons } from './command-state';

export function setupChatCommands(bot: Telegraf<ExtendedContext>) {
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

    logger.info('✅ 聊天相关命令设置完成');
} 