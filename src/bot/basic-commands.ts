import { Telegraf } from 'telegraf';
import { BottleService } from '../services/bottle-service';
import { PointsService } from '../services/points-service';
import { UserService } from '../services/user-service';
import { 
    formatBottleMessage, 
    formatUserStats, 
    formatGlobalStats, 
    formatThrowSuccess, 
    formatReplySuccess, 
    formatHelpMessage 
} from '../utils/message-formatter';
import { logger } from '../utils/logger';
import { ExtendedContext, pendingReplies, currentlyViewing } from './command-state';
import { TelegramRetryHandler } from '../utils/telegram-retry';

export function setupBasicCommands(bot: Telegraf<ExtendedContext>) {
    // 开始命令
    bot.start(async (ctx) => {
        // 添加调试日志
        logger.info(`/start命令被调用: 用户${ctx.from?.id}, 聊天类型${ctx.chat.type}, 机器人用户名: ${ctx.botInfo?.username}`);
        
        // 检查是否启用Web App (只在HTTPS环境下启用)
        const isWebAppEnabled = process.env.WEBAPP_URL && process.env.WEBAPP_URL.startsWith('https://');
        
        const inlineKeyboard: any = [
            // [
            //     { text: '📝 投放漂流瓶', callback_data: 'throw' },
            //     { text: '🎣 捡拾漂流瓶', callback_data: 'pick' }
            // ],
            // [
            //     { text: '💰 我的积分', callback_data: 'points' },
            //     { text: '📊 我的统计', callback_data: 'stats' }
            // ],
            // [{ text: '❓ 帮助', callback_data: 'help' }]
        ];

        // 只在HTTPS环境下添加Web App按钮
        if (isWebAppEnabled) {
            inlineKeyboard.unshift([{ text: '🌐 打开 Mini App', web_app: { url: `${process.env.WEBAPP_URL}/app` } }]);
        }
        
        await ctx.reply(
            `🌊 欢迎来到漂流瓶世界！\n\n` +
            `这里你可以:\n` +
            `📝 投放漂流瓶 - 分享你的心情和想法\n` +
            `🎣 捡拾漂流瓶 - 发现他人的故事\n` +
            `💬 回复漂流瓶 - 与陌生人交流\n` +
            `💰 积分系统 - 参与互动获得奖励\n\n` +
            `开始你的漂流瓶之旅吧！ 🚀\n\n` +
            `机器人用户名: @${ctx.botInfo?.username || '未知'}\n` +
            `当前聊天类型: ${ctx.chat.type}\n\n` +
            `使用 /help 查看详细帮助`,
            {
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            }
        );
    });

    // Mini App 启动命令
    bot.command('app', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否启用Web App
            const isWebAppEnabled = process.env.WEBAPP_URL && process.env.WEBAPP_URL.startsWith('https://');
            
            if (!isWebAppEnabled) {
                await ctx.reply(
                    '📱 Mini App 功能暂时不可用\n\n' +
                    '原因：本地开发环境不支持Web App (需要HTTPS)\n\n' +
                    '你可以继续使用以下功能：\n' +
                    '📝 /throw - 投放漂流瓶\n' +
                    '🎣 /pick - 捡拾漂流瓶\n' +
                    '💰 /points - 查看积分\n' +
                    '📊 /stats - 查看统计\n' +
                    '🛒 /shop - 积分商店\n' +
                    '🏆 /achievements - 成就系统\n\n' +
                    '部署到支持HTTPS的服务器后即可使用Web App功能 🚀',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '📝 投放漂流瓶', callback_data: 'throw' },
                                    { text: '🎣 捡拾漂流瓶', callback_data: 'pick' }
                                ],
                                [
                                    { text: '💰 我的积分', callback_data: 'points' },
                                    { text: '🛒 积分商店', callback_data: 'shop' }
                                ],
                                [{ text: '🏠 返回主菜单', callback_data: 'menu' }]
                            ]
                        }
                    }
                );
                return;
            }

            // 确保用户信息存在
            await UserService.getUserInfo(userId, ctx.from);
            
            const webAppUrl = `${process.env.WEBAPP_URL}/app`;
            
            await ctx.reply(
                '🎉 欢迎使用漂流瓶 Mini App！\n\n' +
                '在这里你可以：\n' +
                '📱 更便捷地管理漂流瓶\n' +
                '💰 查看详细的积分和等级信息\n' +
                '🛒 浏览和购买商店商品\n' +
                '🏆 查看排行榜和成就\n' +
                '📊 查看详细的统计数据\n' +
                '🎮 享受更丰富的交互体验\n\n' +
                '点击下方按钮开始体验：',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🌐 打开漂流瓶应用', web_app: { url: webAppUrl } }],
                            [
                                { text: '📱 如何使用 Mini App', callback_data: 'help_miniapp' },
                                { text: '🔧 技术支持', callback_data: 'tech_support' }
                            ],
                            [{ text: '🏠 返回主菜单', callback_data: 'menu' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            logger.error('启动 Mini App 失败:', error);
            await ctx.reply('启动应用失败，请稍后重试。如果问题持续存在，请联系管理员。');
        }
    });

    // 帮助命令
    bot.command('help', async (ctx) => {
        const helpMessage = `
🌊 **漂流瓶机器人使用指南** 🌊

**📝 基础功能**
• 直接发送消息 - 投放漂流瓶
• /throw <内容> - 投放指定内容的漂流瓶
• /pick - 捡拾漂流瓶 ⚡

**🎣 捡拾说明**
捡拾漂流瓶现在是概率事件：
• 🌊 新手水手: 60% 成功率
• ⚓ 见习船员: 70% 成功率  
• 🚢 资深航海者: 78% 成功率
• 🏴‍☠️ 海洋探索家: 85% 成功率
• 👑 漂流瓶大师: 90% 成功率

**🔥 成功率加成**
• 💎 VIP会员: +3% 概率
• 🍀 幸运加成道具: +10% 概率
• 📈 等级越高，成功率越高！

**💰 积分系统**
• /points - 查看积分和等级
• /checkin - 每日签到获得积分
• /shop - 积分商店购买道具
• /buy <商品ID> - 购买商品
• /leaderboard - 积分排行榜

**📊 统计功能**
• /stats - 个人统计信息
• /global - 全局统计数据

**🎮 进阶玩法**
• 回复漂流瓶增加互动
• 升级解锁更多特权
• 购买道具增强体验
• 参与排行榜竞争

**💡 小贴士**
• 积极投放和回复瓶子可快速升级
• 连续签到有额外奖励
• VIP会员享受多重特权
• 即使捡拾失败也有安慰奖积分

有问题？发送 /start 查看快速入门！
        `;
        
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    });

    // 投放漂流瓶命令
    bot.command('throw', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是群组消息
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            if (isGroupMessage) {
                // 在群组中提醒用户私聊Bot
                try {
                    const botInfo = await TelegramRetryHandler.executeWithRetry(
                        () => ctx.telegram.getMe(),
                        'getMe for throw command'
                    );
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `为了保护您的隐私，请私聊我来投放漂流瓶：\n` +
                        `👆 点击我的用户名 @${botInfo.username} 开始私聊\n\n` +
                        `💡 然后发送: /throw 你的漂流瓶内容`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '📱 开始私聊', url: `https://t.me/${botInfo.username}` }
                                ]]
                            }
                        }
                    );
                } catch (error) {
                    logger.error('获取机器人信息失败:', error);
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `请私聊我来投放漂流瓶 💬`
                    );
                }
                return;
            }

            // 获取命令后的文本
            const text = ctx.message.text.replace('/throw', '').trim();
            
            if (!text) {
                await ctx.reply(
                    '📝 请在命令后输入漂流瓶内容\n\n' +
                    '例如: /throw 今天天气真好，心情也很棒！\n\n' +
                    '或者直接发送文字、图片、语音等内容也可以投放漂流瓶哦～'
                );
                return;
            }

            const bottleId = await BottleService.throwBottle({
                senderId: userId,
                senderUsername: username,
                content: text
            });

            await ctx.reply(formatThrowSuccess(bottleId, text));

        } catch (error) {
            logger.error('投放漂流瓶失败:', error);
            const errorMessage = error instanceof Error ? error.message : '投放失败，请稍后重试';
            await ctx.reply(`❌ ${errorMessage}`);
        }
    });

    // 捡拾漂流瓶命令
    bot.command('pick', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是群组消息
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            if (isGroupMessage) {
                // 在群组中提醒用户私聊Bot
                try {
                    const botInfo = await TelegramRetryHandler.executeWithRetry(
                        () => ctx.telegram.getMe(),
                        'getMe for pick command'
                    );
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `为了保护您的隐私，请私聊我来捡拾漂流瓶：\n` +
                        `👆 点击我的用户名 @${botInfo.username} 开始私聊\n\n` +
                        `💡 然后发送: /pick`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '📱 开始私聊', url: `https://t.me/${botInfo.username}` }
                                ]]
                            }
                        }
                    );
                } catch (error) {
                    logger.error('获取机器人信息失败:', error);
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `请私聊我来捡拾漂流瓶 💬`
                    );
                }
                return;
            }

            // 显示正在捡拾的提示
            const loadingMessage = await ctx.reply('🌊 正在大海中搜寻漂流瓶...');

            const bottle = await BottleService.pickBottle(userId);
            
            // 删除加载提示
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
            } catch (deleteError) {
                // 忽略删除失败的错误
            }
            
            if (!bottle) {
                // 🆕 获取用户等级信息以提供个性化的失败提示
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

                await ctx.reply(
                    `🌊 这次没有捡到漂流瓶...\n\n` +
                    `${encouragementMessage}\n\n` +
                    `🏆 你的等级: ${levelName}\n` +
                    `💡 获得安慰奖: +1积分\n\n` +
                    `💪 想要提高成功率吗？\n` +
                    `• 🔄 继续投放和回复瓶子提升等级\n` +
                    `• 🛒 在商店购买🍀幸运加成道具\n` +
                    `• 💎 成为VIP会员享受概率加成`,
                    {
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
                    }
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

        } catch (error) {
            logger.error('捡拾漂流瓶失败:', error);
            await ctx.reply('❌ 捡拾失败，请稍后重试');
        }
    });

    // 回复漂流瓶命令
    bot.command('reply', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            // 检查是否是群组消息
            const isGroupMessage = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            if (isGroupMessage) {
                // 在群组中提醒用户私聊Bot
                try {
                    const botInfo = await TelegramRetryHandler.executeWithRetry(
                        () => ctx.telegram.getMe(),
                        'getMe for reply command'
                    );
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `为了保护您的隐私，请私聊我来回复漂流瓶：\n` +
                        `👆 点击我的用户名 @${botInfo.username} 开始私聊\n\n` +
                        `💡 然后发送: /reply <瓶子ID> <回复内容>`,
                        {
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '📱 开始私聊', url: `https://t.me/${botInfo.username}` }
                                ]]
                            }
                        }
                    );
                } catch (error) {
                    logger.error('获取机器人信息失败:', error);
                    await ctx.reply(
                        `🔒 漂流瓶功能需要在私聊中使用\n\n` +
                        `请私聊我来回复漂流瓶 💬`
                    );
                }
                return;
            }

            const args = ctx.message.text.split(' ');
            if (args.length < 3) {
                await ctx.reply(
                    '💬 回复格式错误\n\n' +
                    '正确格式: /reply <瓶子ID> <回复内容>\n' +
                    '例如: /reply abc123 谢谢分享，很有趣的想法！'
                );
                return;
            }

            const bottleId = args[1];
            const replyContent = args.slice(2).join(' ');

            await BottleService.replyToBottle({
                bottleId,
                senderId: userId,
                senderUsername: username,
                content: replyContent
            });

            await ctx.reply(formatReplySuccess(bottleId));

        } catch (error) {
            logger.error('回复漂流瓶失败:', error);
            await ctx.reply('❌ 回复失败，请检查瓶子ID是否正确');
        }
    });

    // 个人统计命令
    bot.command('stats', async (ctx) => {
        try {
            const userId = ctx.from?.id;
            
            if (!userId) {
                await ctx.reply('❌ 无法获取用户信息');
                return;
            }

            const userStats = await BottleService.getUserStats(userId);
            const message = formatUserStats(userStats);
            await ctx.reply(message);

        } catch (error) {
            logger.error('获取统计信息失败:', error);
            await ctx.reply('❌ 获取统计信息失败，请稍后重试');
        }
    });

    // 全局统计命令
    bot.command('global', async (ctx) => {
        try {
            const globalStats = await BottleService.getGlobalStats();
            const message = formatGlobalStats(globalStats);
            await ctx.reply(message);

        } catch (error) {
            logger.error('获取全局统计失败:', error);
            await ctx.reply('❌ 获取全局统计失败，请稍后重试');
        }
    });

    // 状态命令
    bot.command('status', async (ctx) => {
        try {
            const globalStats = await BottleService.getGlobalStats();
            let message = `🤖 机器人状态: 运行中\n\n`;
            message += `📊 数据统计:\n`;
            message += `• 总漂流瓶: ${globalStats.totalBottles} 个\n`;
            message += `• 漂流中: ${globalStats.activeBottles} 个\n`;
            message += `• 总回复: ${globalStats.totalReplies} 条\n`;
            message += `• 用户数: ${globalStats.totalUsers} 人\n`;
            message += `• 总积分: ${globalStats.totalPoints} 分\n`;
            
            if (globalStats.topUser) {
                message += `\n👑 积分王者: ${globalStats.topUser.username}\n`;
                message += `   ${globalStats.topUser.level} | ${globalStats.topUser.points}积分\n`;
            }
            
            message += `\n⏰ 运行时间: ${Math.floor(process.uptime() / 3600)}小时${Math.floor((process.uptime() % 3600) / 60)}分钟`;
            
            await ctx.reply(message);
        } catch (error) {
            logger.error('获取状态失败:', error);
            await ctx.reply('❌ 获取状态失败');
        }
    });

    logger.info('✅ 基础漂流瓶命令设置完成');
}