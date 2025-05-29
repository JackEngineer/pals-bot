import cron from 'node-cron';
import { PointsService } from '../services/points-service';
import { logger } from './logger';

export class Scheduler {
    // 启动所有定时任务
    static startAll(): void {
        this.startCleanupTask();
        this.startDailyResetTask();
        this.startWeeklyReportTask();
        
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

    // 停止所有定时任务
    static stopAll(): void {
        cron.getTasks().forEach(task => {
            task.stop();
        });
        logger.info('🛑 所有定时任务已停止');
    }
} 