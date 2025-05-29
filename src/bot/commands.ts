import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';

// 导入各个模块化的命令处理器
import { ExtendedContext } from './command-state';
import { setupBasicCommands } from './basic-commands';
import { setupPointsCommands } from './points-commands';
import { setupChatCommands } from './chat-commands';
import { setupFriendCommands } from './friend-commands';
import { setupAdminCommands } from './admin-commands';
import { setupCallbackHandlers } from './callback-handlers';
import { setupMessageHandlers } from './message-handlers';

/**
 * 设置所有机器人命令和处理器
 * @param bot Telegraf机器人实例
 */
export function setupCommands(bot: Telegraf<ExtendedContext>) {
    try {
        logger.info('🚀 开始设置机器人命令模块...');

        // 设置基础漂流瓶命令
        setupBasicCommands(bot);

        // 设置积分系统命令
        setupPointsCommands(bot);

        // 设置聊天相关命令
        setupChatCommands(bot);

        // 设置好友系统命令
        setupFriendCommands(bot);

        // 设置管理员命令
        setupAdminCommands(bot);

        // 设置回调查询处理器
        setupCallbackHandlers(bot);

        // 设置消息处理中间件
        setupMessageHandlers(bot);

        logger.info('✅ 所有机器人命令模块设置完成');

    } catch (error) {
        logger.error('❌ 设置机器人命令失败:', error);
        throw error;
    }
}