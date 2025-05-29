import cron from 'node-cron';
import { PointsService } from '../services/points-service';
import { BroadcastService } from '../services/broadcast-service';
import { logger } from './logger';

export class Scheduler {
    // 启动所有定时任务
    static startAll(): void {
        this.startCleanupTask();
        this.startDailyResetTask();
        this.startWeeklyReportTask();
        this.startBroadcastTasks();
        
        logger.info('✅ 所有定时任务已启动');
    }

    // 清理过期购买记录的定时任务 (每小时执行一次)
    private static startCleanupTask(): void {
        cron.schedule('0 * * * *', async () => {
            try {
                logger.info('开始清理过期购买记录...');
                await PointsService.cleanupExpiredPurchases();
                logger.info('清理过期购买记录完成');
            } catch (error) {
                logger.error('清理过期购买记录失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        logger.info('🔄 清理任务已启动 (每小时执行)');
    }

    // 每日重置任务 (每天凌晨1点执行)
    private static startDailyResetTask(): void {
        cron.schedule('0 1 * * *', async () => {
            try {
                logger.info('执行每日重置任务...');
                
                // 这里可以添加每日重置逻辑
                // 比如重置每日限制、统计数据等
                
                logger.info('每日重置任务完成');
            } catch (error) {
                logger.error('每日重置任务失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        logger.info('🌅 每日重置任务已启动 (每天1点执行)');
    }

    // 周报任务 (每周一凌晨2点执行)
    private static startWeeklyReportTask(): void {
        cron.schedule('0 2 * * 1', async () => {
            try {
                logger.info('生成周报数据...');
                
                // 这里可以添加周报生成逻辑
                // 比如统计周活跃用户、热门漂流瓶等
                
                logger.info('周报数据生成完成');
            } catch (error) {
                logger.error('周报生成失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        logger.info('📊 周报任务已启动 (每周一2点执行)');
    }

    // 广播任务
    private static startBroadcastTasks(): void {
        // 每日活跃推广 (每天上午10点)
        cron.schedule('0 10 * * *', async () => {
            try {
                logger.info('执行每日活跃推广广播...');
                
                // 查找并执行日常活跃推广模板
                const templates = await BroadcastService.getBroadcastTemplates();
                const dailyTemplate = templates.find(t => t.name === '日常活跃推广');
                
                if (dailyTemplate) {
                    const result = await BroadcastService.executeBroadcast(dailyTemplate.id);
                    logger.info(`每日活跃推广完成: 成功 ${result.successCount}, 失败 ${result.failedCount}`);
                } else {
                    logger.warn('未找到日常活跃推广模板');
                }
            } catch (error) {
                logger.error('每日活跃推广失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        // 周末活动推广 (每周五晚上8点)
        cron.schedule('0 20 * * 5', async () => {
            try {
                logger.info('执行周末活动推广广播...');
                
                const templates = await BroadcastService.getBroadcastTemplates();
                const weekendTemplate = templates.find(t => t.name === '周末活动推广');
                
                if (weekendTemplate) {
                    const result = await BroadcastService.executeBroadcast(weekendTemplate.id);
                    logger.info(`周末活动推广完成: 成功 ${result.successCount}, 失败 ${result.failedCount}`);
                } else {
                    logger.warn('未找到周末活动推广模板');
                }
            } catch (error) {
                logger.error('周末活动推广失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        // 功能更新通知 (每周三下午3点)
        cron.schedule('0 15 * * 3', async () => {
            try {
                logger.info('执行功能更新通知广播...');
                
                const templates = await BroadcastService.getBroadcastTemplates();
                const updateTemplate = templates.find(t => t.name === '功能更新通知');
                
                if (updateTemplate) {
                    const result = await BroadcastService.executeBroadcast(updateTemplate.id);
                    logger.info(`功能更新通知完成: 成功 ${result.successCount}, 失败 ${result.failedCount}`);
                } else {
                    logger.warn('未找到功能更新通知模板');
                }
            } catch (error) {
                logger.error('功能更新通知失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        // 清理旧广播日志 (每天凌晨3点)
        cron.schedule('0 3 * * *', async () => {
            try {
                logger.info('清理旧的广播日志...');
                const cleanedCount = await BroadcastService.cleanupOldLogs(30);
                logger.info(`广播日志清理完成，删除了 ${cleanedCount} 条记录`);
            } catch (error) {
                logger.error('清理广播日志失败:', error);
            }
        }, {
            timezone: 'Asia/Shanghai'
        });

        logger.info('📢 广播任务已启动');
        logger.info('  - 每日活跃推广: 每天10点');
        logger.info('  - 周末活动推广: 每周五20点');
        logger.info('  - 功能更新通知: 每周三15点');
        logger.info('  - 日志清理: 每天3点');
    }

    // 停止所有定时任务
    static stopAll(): void {
        cron.getTasks().forEach(task => {
            task.stop();
        });
        logger.info('🛑 所有定时任务已停止');
    }
} 