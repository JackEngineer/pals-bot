import dotenv from 'dotenv';
import { Telegraf, Context } from 'telegraf';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { setupDatabase } from './services/database';
import { setupLogger } from './utils/logger';
import { BottleService } from './services/bottle-service';
import { PointsService } from './services/points-service';
import { Scheduler } from './utils/scheduler';
import { setupCommands } from './bot/commands';
import { setupHandlers } from './bot/handlers';

// 加载环境变量
dotenv.config();

const logger = setupLogger();

class PalsBot {
    private bot: Telegraf<Context>;
    private app: express.Application;

    constructor() {
        if (!process.env.BOT_TOKEN) {
            throw new Error('BOT_TOKEN is required');
        }
        
        // 创建机器人实例，支持代理
        const botOptions: any = {};
        
        // 检查是否配置了代理
        if (process.env.PROXY_URL) {
            logger.info(`使用代理: ${process.env.PROXY_URL}`);
            
            if (process.env.PROXY_URL.startsWith('socks')) {
                botOptions.telegram = {
                    agent: new SocksProxyAgent(process.env.PROXY_URL)
                };
            } else if (process.env.PROXY_URL.startsWith('http')) {
                botOptions.telegram = {
                    agent: new HttpsProxyAgent(process.env.PROXY_URL)
                };
            }
        }
        
        this.bot = new Telegraf(process.env.BOT_TOKEN, botOptions);
        this.app = express();
        
        this.setupExpress();
        this.setupBot();
    }

    private setupExpress() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(express.json());

        // 健康检查端点
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage()
            });
        });

        // 机器人状态端点
        this.app.get('/bot/status', async (req, res) => {
            try {
                const me = await this.bot.telegram.getMe();
                const stats = await BottleService.getGlobalStats();
                res.json({
                    bot: me,
                    status: 'running',
                    stats
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 积分排行榜API端点
        this.app.get('/api/leaderboard', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 10;
                const leaderboard = await PointsService.getLeaderboard(limit);
                res.json({
                    success: true,
                    data: leaderboard
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 积分商店API端点
        this.app.get('/api/shop', async (req, res) => {
            try {
                const category = req.query.category as string;
                const items = await PointsService.getShopItems(category);
                res.json({
                    success: true,
                    data: items
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
    }

    private setupBot() {
        try {
            logger.info('开始设置机器人...');
            
            // 设置命令
            setupCommands(this.bot);
            logger.info('✅ 命令设置完成');
            
            // 设置消息处理器
            setupHandlers(this.bot);
            logger.info('✅ 消息处理器设置完成');

            // 错误处理
            this.bot.catch((err, ctx) => {
                logger.error('Bot error:', err);
                ctx.reply('抱歉，处理您的请求时出现了错误。请稍后重试。');
            });
            
            logger.info('🎉 机器人设置完成');
            
        } catch (error) {
            logger.error('机器人设置失败:', error);
            throw error;
        }
    }

    async start() {
        try {
            // 初始化数据库
            await setupDatabase();
            logger.info('数据库初始化完成');

            // 启动定时任务
            Scheduler.startAll();
            logger.info('定时任务启动完成');

            // 启动Express服务器
            const port = process.env.PORT || 3000;
            this.app.listen(port, () => {
                logger.info(`HTTP服务器启动在端口 ${port}`);
            });

            // 测试Telegram连接
            logger.info('正在测试Telegram连接...');
            const me = await this.bot.telegram.getMe();
            logger.info(`机器人信息: @${me.username} (${me.first_name})`);

            // 启动机器人
            await this.bot.launch();
            logger.info('Telegram机器人启动成功');

            // 输出启动成功信息
            logger.info('🎉 漂流瓶机器人（含积分系统）启动成功！');
            logger.info('支持的功能:');
            logger.info('📝 漂流瓶投放、捡拾、回复');
            logger.info('💰 完整的积分系统');
            logger.info('🛒 积分商店');
            logger.info('🏆 等级系统');
            logger.info('🎯 成就系统');
            logger.info('💎 VIP会员系统');

            // 优雅关闭
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));

        } catch (error) {
            logger.error('启动失败:', error);
            
            if (error instanceof Error && error.message.includes('ETIMEDOUT')) {
                logger.error('网络连接超时，请检查：');
                logger.error('1. 网络连接是否正常');
                logger.error('2. 是否需要配置代理 (设置 PROXY_URL 环境变量)');
                logger.error('3. Bot Token 是否正确');
            }
            
            process.exit(1);
        }
    }

    private stop(signal: string) {
        logger.info(`收到 ${signal} 信号，正在关闭...`);
        
        // 停止定时任务
        Scheduler.stopAll();
        
        // 停止机器人
        this.bot.stop(signal);
        process.exit(0);
    }
}

// 启动应用
const bot = new PalsBot();
bot.start().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
}); 