import dotenv from 'dotenv';
import { Telegraf, Context } from 'telegraf';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { setupDatabase } from './services/database';
import { setupLogger } from './utils/logger';
import { BottleService } from './services/bottle-service';
import { PointsService } from './services/points-service';
import { NotificationService } from './services/notification-service';
import { BroadcastService } from './services/broadcast-service';
import { MonitorService } from './services/monitor-service';
import { Scheduler } from './utils/scheduler';
import { setupCommands } from './bot/commands';
import { setupHandlers } from './bot/handlers';
import { TelegramRetryHandler } from './utils/telegram-retry';
import { PerformanceMonitor } from './utils/performance-monitor';
import { CacheManager } from './utils/cache-manager';
import miniAppRoutes from './api/routes/mini-app';

// 加载环境变量
dotenv.config();

const logger = setupLogger();

// 初始化性能监控
PerformanceMonitor.initialize();

// 设置全局异常处理
process.on('unhandledRejection', (reason, promise) => {
    logger.error('未捕获的Promise异常:', reason);
    logger.error('Promise:', promise);
    // 记录但不退出程序，让重试机制处理网络错误
});

process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常:', error);
    // 对于严重错误，优雅退出
    if (error.message.includes('EADDRINUSE') || error.message.includes('Critical')) {
        logger.error('严重错误，程序即将退出');
        process.exit(1);
    }
});

// 监听进程警告
process.on('warning', (warning) => {
    logger.warn('进程警告:', warning);
});

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
        // 设置安全标头，为Mini App优化
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:", "https:", "blob:"],
                    connectSrc: ["'self'", "https://api.telegram.org"],
                    frameSrc: ["'none'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'", "data:", "blob:"]
                }
            },
            xFrameOptions: { action: 'sameorigin' }
        }));

        // CORS配置，支持Telegram Web App
        this.app.use(cors({
            origin: [
                'https://telegram.org',
                'https://web.telegram.org',
                'https://tg.dev',
                // 开发环境支持
                ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])
            ],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // 静态文件服务 - Mini App 前端
        const webappPath = path.join(__dirname, 'webapp/dist');
        this.app.use('/webapp', express.static(webappPath, {
            maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
            setHeaders: (res, filePath) => {
                // 为HTML文件设置不缓存
                if (filePath.endsWith('.html')) {
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                }
            }
        }));

        // Mini App API 路由
        this.app.use('/api/miniapp', miniAppRoutes);

        // Mini App 主页面路由
        this.app.get(['/app', '/app/*'], (req, res) => {
            const indexPath = path.join(webappPath, 'index.html');
            res.sendFile(indexPath, (err) => {
                if (err) {
                    logger.error('发送Mini App页面失败:', err);
                    res.status(404).json({
                        success: false,
                        error: 'Mini App not found'
                    });
                }
            });
        });

        // 健康检查端点 - 增强版
        this.app.get('/health', async (req, res) => {
            try {
                const healthMetrics = await PerformanceMonitor.getHealthMetrics();
                const memoryReport = PerformanceMonitor.getMemoryReport();
                
                const health = {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: healthMetrics.memoryUsage,
                    memoryTrend: memoryReport.trend,
                    memoryWarning: memoryReport.warning,
                    cpu: healthMetrics.cpuUsage,
                    errorRate: healthMetrics.errorRate,
                    avgResponseTime: healthMetrics.avgResponseTime,
                    version: process.env.npm_package_version || 'unknown',
                    miniapp_enabled: true
                };

                // 根据健康状态返回适当的HTTP状态码
                const status = memoryReport.warning || healthMetrics.errorRate > 10 ? 503 : 200;
                res.status(status).json(health);
            } catch (error) {
                logger.error('健康检查失败:', error);
                res.status(500).json({
                    status: 'error',
                    timestamp: new Date().toISOString(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 性能监控端点
        this.app.get('/metrics', (req, res) => {
            try {
                const operationType = req.query.operation as string;
                const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string) : undefined;
                
                if (operationType) {
                    const stats = PerformanceMonitor.getOperationStats(operationType, timeWindow);
                    res.json({
                        operation: operationType,
                        timeWindow,
                        stats
                    });
                } else {
                    const allMetrics = PerformanceMonitor.exportMetrics();
                    res.json({
                        exportedAt: new Date().toISOString(),
                        metrics: allMetrics
                    });
                }
            } catch (error) {
                logger.error('获取性能指标失败:', error);
                res.status(500).json({
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 缓存状态端点
        this.app.get('/cache', (req, res) => {
            try {
                const cacheStats = CacheManager.getAllCacheStats();
                res.json({
                    timestamp: new Date().toISOString(),
                    caches: cacheStats
                });
            } catch (error) {
                logger.error('获取缓存状态失败:', error);
                res.status(500).json({
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 系统状态端点
        this.app.get('/system', async (req, res) => {
            try {
                const systemMetrics = await MonitorService.getCurrentStatus();
                res.json({
                    ...systemMetrics,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('获取系统状态失败:', error);
                res.status(500).json({
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 机器人状态端点 - 添加错误重试和性能监控
        this.app.get('/bot/status', async (req, res) => {
            try {
                const [me, stats] = await Promise.all([
                    PerformanceMonitor.monitorAsync(
                        () => TelegramRetryHandler.executeWithRetry(
                            () => this.bot.telegram.getMe(),
                            'getMe for status endpoint'
                        ),
                        'bot_status_getMe'
                    ),
                    PerformanceMonitor.monitorAsync(
                        () => BottleService.getGlobalStats(),
                        'bot_status_getStats'
                    )
                ]);
                
                res.json({
                    bot: me,
                    status: 'running',
                    stats,
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                });
            } catch (error) {
                logger.error('获取机器人状态失败:', error);
                res.status(500).json({
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 积分排行榜API端点 - 添加性能监控
        this.app.get('/api/leaderboard', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 10;
                const leaderboard = await PerformanceMonitor.monitorAsync(
                    () => PointsService.getLeaderboard(limit),
                    'api_leaderboard'
                );
                
                res.json({
                    success: true,
                    data: leaderboard
                });
            } catch (error) {
                logger.error('获取排行榜失败:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 积分商店API端点 - 添加性能监控
        this.app.get('/api/shop', async (req, res) => {
            try {
                const category = req.query.category as string;
                const items = await PerformanceMonitor.monitorAsync(
                    () => PointsService.getShopItems(category),
                    'api_shop'
                );
                
                res.json({
                    success: true,
                    data: items
                });
            } catch (error) {
                logger.error('获取商店数据失败:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // 添加Express错误处理中间件
        this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
            logger.error('Express错误:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    private setupBot() {
        try {
            logger.info('开始设置机器人...');
            
            // 设置通知服务的bot实例
            NotificationService.setBotInstance(this.bot);
            
            // 设置广播服务的bot实例
            BroadcastService.setBotInstance(this.bot);
            
            // 设置监控服务的bot实例
            MonitorService.setBotInstance(this.bot);
            
            // 设置命令
            setupCommands(this.bot);
            logger.info('✅ 命令设置完成');
            
            // 设置消息处理器
            setupHandlers(this.bot);
            logger.info('✅ 消息处理器设置完成');

            // 增强的错误处理
            this.bot.catch((err: unknown, ctx) => {
                // 记录到性能监控
                PerformanceMonitor.monitorSync(
                    () => {
                        logger.error('Bot处理错误:', err);
                        
                        // 检查是否是网络错误
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        const isNetworkError = errorMessage && (
                            errorMessage.includes('ECONNRESET') ||
                            errorMessage.includes('ETIMEDOUT') ||
                            errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('FetchError')
                        );

                        if (isNetworkError) {
                            logger.warn('检测到网络错误，将由重试机制处理');
                            // 网络错误不回复用户，避免雪崩
                            return;
                        }

                        // 其他错误才回复用户
                        try {
                            ctx.reply('抱歉，处理您的请求时出现了错误。请稍后重试。').catch((replyErr: Error) => {
                                logger.error('发送错误回复失败:', replyErr);
                            });
                        } catch (replyError) {
                            logger.error('处理错误回复时发生异常:', replyError);
                        }
                        throw err; // 重新抛出以便监控捕获
                    },
                    'bot_error_handler'
                );
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

            // 初始化监控服务（如果配置了管理员ID）
            const adminIds = process.env.ADMIN_IDS ? 
                process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : 
                [];
            
            if (adminIds.length > 0) {
                MonitorService.initialize(adminIds);
                logger.info(`监控服务已启动，管理员: ${adminIds.length} 个`);
            } else {
                logger.warn('未配置管理员ID (ADMIN_IDS)，监控告警功能已禁用');
            }

            // 启动定时任务
            Scheduler.startAll();
            logger.info('定时任务启动完成');

            // 启动Express服务器
            const port = process.env.PORT || 3001;
            this.app.listen(port, () => {
                logger.info(`HTTP服务器启动在端口 ${port}`);
            });

            // 测试Telegram连接
            logger.info('正在测试Telegram连接...');
            const me = await TelegramRetryHandler.executeWithRetry(
                () => this.bot.telegram.getMe(),
                'initial Telegram connection test',
                {
                    maxRetries: 5,
                    baseDelay: 2000,
                    maxDelay: 10000,
                    timeoutMs: 30000
                }
            );
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
            logger.info('📊 性能监控和缓存优化');
            logger.info('🔔 智能告警和监控');

            // 发送启动通知给管理员
            if (adminIds.length > 0) {
                setTimeout(() => {
                    MonitorService.sendStatusReport().catch(err => {
                        logger.error('发送启动状态报告失败:', err);
                    });
                }, 5000); // 5秒后发送
            }

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
        logger.info(`接收到 ${signal} 信号，开始优雅关闭...`);
        
        // 停止机器人
        this.bot.stop(signal);
        
        // 停止定时任务
        Scheduler.stopAll();
        
        // 关闭监控服务
        MonitorService.shutdown();
        
        // 关闭性能监控
        PerformanceMonitor.shutdown();
        
        // 关闭缓存管理器
        CacheManager.shutdown();
        
        logger.info('应用程序已关闭');
        process.exit(0);
    }
}

// 启动应用
const bot = new PalsBot();
bot.start().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
}); 