import { Telegraf } from 'telegraf';
import { FriendService } from '../services/friend-service';
import { UserService } from '../services/user-service';
import { logger } from '../utils/logger';
import { ExtendedContext } from './command-state';

export function setupFriendCommands(bot: Telegraf<ExtendedContext>) {
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

    logger.info('✅ 好友系统命令设置完成');
} 