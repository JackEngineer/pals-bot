import { Telegraf } from 'telegraf';
import { BroadcastService } from '../services/broadcast-service';
import { logger } from '../utils/logger';
import { ExtendedContext } from './command-state';

export function setupAdminCommands(bot: Telegraf<ExtendedContext>) {
    // 开启/关闭群组广播
    bot.command(['broadcast_on', 'broadcast_off'], async (ctx) => {
        try {
            const isOn = ctx.message.text.includes('_on');
            const chatType = ctx.chat.type;
            
            // 仅在群组中生效
            if (chatType !== 'group' && chatType !== 'supergroup') {
                await ctx.reply('❌ 此命令只能在群组中使用');
                return;
            }

            // 检查权限 - 只有管理员可以执行
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            try {
                const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                const isAdmin = member.status === 'administrator' || member.status === 'creator';
                
                if (!isAdmin) {
                    await ctx.reply('❌ 只有群组管理员可以使用此命令');
                    return;
                }
            } catch (error) {
                logger.error('检查管理员权限失败:', error);
                await ctx.reply('❌ 无法验证管理员权限');
                return;
            }

            // 执行开启/关闭广播
            const success = await BroadcastService.toggleGroupBroadcast(ctx.chat.id, isOn);
            
            if (success) {
                if (isOn) {
                    await ctx.reply(`✅ 群组广播已开启

📢 本群组将会收到以下定期推送：
• 每日活跃推广 (每天上午10点)
• 功能更新通知 (每周三下午3点)  
• 周末活动推广 (每周五晚上8点)

💡 可以随时使用 /broadcast_off 关闭广播`);
                } else {
                    await ctx.reply('✅ 群组广播已关闭\n\n💡 可以随时使用 /broadcast_on 重新开启');
                }
            } else {
                await ctx.reply('❌ 操作失败，请稍后重试');
            }
        } catch (error) {
            logger.error('处理广播命令失败:', error);
            await ctx.reply('❌ 命令执行失败，请稍后重试');
        }
    });

    // 手动执行广播 (仅私聊，管理员专用)
    bot.command('admin_broadcast', async (ctx) => {
        try {
            // 仅在私聊中使用
            if (ctx.chat.type !== 'private') {
                await ctx.reply('❌ 此命令只能在私聊中使用');
                return;
            }

            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是超级管理员（可以通过环境变量设置）
            const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];
            if (!adminIds.includes(userId)) {
                await ctx.reply('❌ 权限不足');
                return;
            }

            // 获取命令参数
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0) {
                await ctx.reply(`📢 广播管理命令

使用方法：
/admin_broadcast list - 查看所有广播模板
/admin_broadcast send <模板ID> - 执行指定模板的广播
/admin_broadcast stats - 查看广播统计
/admin_broadcast groups - 查看活跃群组

示例：
/admin_broadcast send 1`);
                return;
            }

            const action = args[0];

            switch (action) {
                case 'list':
                    const templates = await BroadcastService.getBroadcastTemplates();
                    if (templates.length === 0) {
                        await ctx.reply('暂无广播模板');
                        return;
                    }

                    let templateList = '📋 广播模板列表：\n\n';
                    templates.forEach(template => {
                        templateList += `🆔 ID: ${template.id}\n`;
                        templateList += `📝 名称: ${template.name}\n`;
                        templateList += `📄 内容预览: ${template.content.substring(0, 50)}...\n`;
                        templateList += `📅 创建时间: ${template.created_at}\n\n`;
                    });

                    await ctx.reply(templateList);
                    break;

                case 'send':
                    if (args.length < 2) {
                        await ctx.reply('❌ 请指定模板ID\n示例：/admin_broadcast send 1');
                        return;
                    }

                    const templateId = parseInt(args[1]);
                    if (isNaN(templateId)) {
                        await ctx.reply('❌ 模板ID必须是数字');
                        return;
                    }

                    await ctx.reply('📤 开始执行广播，请稍候...');

                    const result = await BroadcastService.executeBroadcast(templateId);
                    
                    await ctx.reply(`📊 广播执行完成

📈 统计信息：
• 目标群组：${result.totalGroups} 个
• 发送成功：${result.successCount} 个
• 发送失败：${result.failedCount} 个
• 成功率：${result.totalGroups > 0 ? Math.round((result.successCount / result.totalGroups) * 100) : 0}%`);
                    break;

                case 'stats':
                    const stats = await BroadcastService.getBroadcastStats();
                    await ctx.reply(`📊 广播统计信息

📤 总发送数：${stats.totalSent}
❌ 总失败数：${stats.totalFailed}
🚫 总阻止数：${stats.totalBlocked}
✅ 成功率：${stats.successRate}%`);
                    break;

                case 'groups':
                    const groups = await BroadcastService.getActiveChatGroups();
                    if (groups.length === 0) {
                        await ctx.reply('暂无活跃群组');
                        return;
                    }

                    let groupList = `👥 活跃群组列表 (${groups.length}个)：\n\n`;
                    groups.slice(0, 20).forEach(group => { // 只显示前20个
                        groupList += `🆔 ID: ${group.chat_id}\n`;
                        groupList += `📝 名称: ${group.title || '未知'}\n`;
                        groupList += `📊 类型: ${group.chat_type}\n`;
                        groupList += `📅 最后活跃: ${group.last_activity_at}\n\n`;
                    });

                    if (groups.length > 20) {
                        groupList += `...(还有 ${groups.length - 20} 个群组)`;
                    }

                    await ctx.reply(groupList);
                    break;

                default:
                    await ctx.reply('❌ 未知的操作，请使用 /admin_broadcast 查看帮助');
            }

        } catch (error) {
            logger.error('管理员广播命令失败:', error);
            await ctx.reply('❌ 命令执行失败，请稍后重试');
        }
    });

    logger.info('✅ 管理员命令设置完成');
} 