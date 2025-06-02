import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { CacheManager } from '../utils/cache-manager';
import { TelegramRetryHandler } from '../utils/telegram-retry';
import { dbGet } from './database';

interface AlertRule {
  name: string;
  condition: (metrics: SystemMetrics) => boolean;
  message: (metrics: SystemMetrics) => string;
  cooldownMs: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

interface SystemMetrics {
  timestamp: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  memoryTrend: 'increasing' | 'decreasing' | 'stable';
  memoryWarning: boolean;
  cpuUsage: NodeJS.CpuUsage | null;
  errorRate: number;
  avgResponseTime: number;
  dbConnections: number;
  cacheStats: Record<string, any>;
  activeUsers: number;
  totalUsers: number;
  systemLoad: {
    requests: number;
    errors: number;
    successRate: number;
  };
}

export class MonitorService {
  private static alertRules: AlertRule[] = [];
  private static lastAlerts = new Map<string, number>();
  private static monitoringTimer: NodeJS.Timeout | null = null;
  private static adminChatIds: number[] = [];
  private static botInstance: any = null;

  /**
   * 初始化监控服务
   */
  static initialize(adminChatIds: number[] = []): void {
    this.adminChatIds = adminChatIds;
    this.setupDefaultAlertRules();
    this.startMonitoring();
    logger.info('监控服务已初始化', { adminCount: adminChatIds.length });
  }

  /**
   * 设置机器人实例用于发送告警
   */
  static setBotInstance(bot: any): void {
    this.botInstance = bot;
  }

  /**
   * 设置默认告警规则
   */
  private static setupDefaultAlertRules(): void {
    this.alertRules = [
      {
        name: 'high_memory_usage',
        condition: (metrics) => metrics.memoryUsage.heapUsed > 1024 * 1024 * 1024, // 1GB
        message: (metrics) => 
          `🚨 内存使用过高\n` +
          `堆内存: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB\n` +
          `趋势: ${metrics.memoryTrend}`,
        cooldownMs: 15 * 60 * 1000, // 15分钟
        severity: 'warning'
      },
      {
        name: 'high_error_rate',
        condition: (metrics) => metrics.errorRate > 20,
        message: (metrics) => 
          `🚨 错误率过高\n` +
          `错误率: ${metrics.errorRate.toFixed(2)}%\n` +
          `平均响应时间: ${metrics.avgResponseTime.toFixed(2)}ms`,
        cooldownMs: 10 * 60 * 1000, // 10分钟
        severity: 'error'
      },
      {
        name: 'slow_response_time',
        condition: (metrics) => metrics.avgResponseTime > 5000,
        message: (metrics) => 
          `⚠️ 响应时间过慢\n` +
          `平均响应时间: ${metrics.avgResponseTime.toFixed(2)}ms\n` +
          `错误率: ${metrics.errorRate.toFixed(2)}%`,
        cooldownMs: 5 * 60 * 1000, // 5分钟
        severity: 'warning'
      },
      {
        name: 'memory_leak_warning',
        condition: (metrics) => metrics.memoryTrend === 'increasing' && metrics.memoryWarning,
        message: (metrics) => 
          `🔍 可能的内存泄漏\n` +
          `内存持续增长，当前: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB\n` +
          `请检查应用状态`,
        cooldownMs: 30 * 60 * 1000, // 30分钟
        severity: 'critical'
      },
      {
        name: 'cache_performance',
        condition: (metrics) => {
          // 检查缓存命中率是否过低
          const cacheStats = metrics.cacheStats;
          for (const stats of Object.values(cacheStats)) {
            if (stats && typeof stats === 'object' && stats.hitRate < 50 && stats.size > 10) {
              return true;
            }
          }
          return false;
        },
        message: (metrics) => 
          `📊 缓存性能告警\n` +
          `部分缓存命中率偏低，请检查缓存配置`,
        cooldownMs: 60 * 60 * 1000, // 1小时
        severity: 'info'
      }
    ];
  }

  /**
   * 开始监控
   */
  private static startMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    // 每分钟检查一次
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.checkSystemHealth();
      } catch (error) {
        logger.error('系统健康检查失败:', error);
      }
    }, 60 * 1000); // 1分钟
  }

  /**
   * 检查系统健康状态
   */
  private static async checkSystemHealth(): Promise<void> {
    const metrics = await this.collectMetrics();
    
    // 检查告警规则
    for (const rule of this.alertRules) {
      try {
        if (rule.condition(metrics)) {
          await this.triggerAlert(rule, metrics);
        }
      } catch (error) {
        logger.error(`告警规则 ${rule.name} 检查失败:`, error);
      }
    }

    // 记录系统指标（仅在调试模式下）
    if (process.env.NODE_ENV === 'development') {
      logger.debug('系统指标:', {
        memoryMB: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
        errorRate: metrics.errorRate,
        avgResponseTime: metrics.avgResponseTime,
        activeUsers: metrics.activeUsers
      });
    }
  }

  /**
   * 收集系统指标
   */
  private static async collectMetrics(): Promise<SystemMetrics> {
    const healthMetrics = await PerformanceMonitor.getHealthMetrics();
    const memoryReport = PerformanceMonitor.getMemoryReport();
    const cacheStats = CacheManager.getAllCacheStats();

    // 收集用户统计
    let activeUsers = 0;
    let totalUsers = 0;
    
    try {
      const userStats = await dbGet(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN last_active_at > datetime('now', '-1 hour') THEN 1 END) as active
        FROM users
      `);
      
      totalUsers = userStats?.total || 0;
      activeUsers = userStats?.active || 0;
    } catch (error) {
      logger.warn('获取用户统计失败:', error);
    }

    // 计算系统负载
    const telegramStats = PerformanceMonitor.getOperationStats('telegram_retry', 5 * 60 * 1000);
    const systemLoad = {
      requests: telegramStats.totalCalls,
      errors: telegramStats.totalCalls - Math.round(telegramStats.totalCalls * telegramStats.successRate / 100),
      successRate: telegramStats.successRate
    };

    return {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memoryUsage: memoryReport.current,
      memoryTrend: memoryReport.trend,
      memoryWarning: memoryReport.warning,
      cpuUsage: healthMetrics.cpuUsage,
      errorRate: healthMetrics.errorRate,
      avgResponseTime: healthMetrics.avgResponseTime,
      dbConnections: 1, // SQLite 单连接
      cacheStats,
      activeUsers,
      totalUsers,
      systemLoad
    };
  }

  /**
   * 触发告警
   */
  private static async triggerAlert(rule: AlertRule, metrics: SystemMetrics): Promise<void> {
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(rule.name) || 0;

    // 检查冷却时间
    if (now - lastAlert < rule.cooldownMs) {
      return;
    }

    this.lastAlerts.set(rule.name, now);

    const message = `
🤖 *系统监控告警*

**规则**: ${rule.name}
**级别**: ${rule.severity.toUpperCase()}
**时间**: ${new Date().toLocaleString('zh-CN')}

${rule.message(metrics)}

**系统状态**:
• 运行时间: ${Math.round(metrics.uptime / 3600)}小时
• 内存使用: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB
• 活跃用户: ${metrics.activeUsers}/${metrics.totalUsers}
• 成功率: ${metrics.systemLoad.successRate.toFixed(2)}%
    `.trim();

    // 记录告警
    logger.warn(`告警触发: ${rule.name}`, {
      severity: rule.severity,
      message: rule.message(metrics)
    });

    // 发送告警消息给管理员
    await this.sendAlertToAdmins(message);
  }

  /**
   * 发送告警消息给管理员
   */
  private static async sendAlertToAdmins(message: string): Promise<void> {
    if (!this.botInstance || this.adminChatIds.length === 0) {
      logger.warn('无法发送告警: 机器人实例或管理员ID未设置');
      return;
    }

    const sendPromises = this.adminChatIds.map(chatId => 
      TelegramRetryHandler.sendMessageWithRetry(
        () => this.botInstance.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' }),
        chatId,
        'alert_notification'
      )
    );

    const results = await Promise.allSettled(sendPromises);
    const failedCount = results.filter(r => r.status === 'rejected').length;
    
    if (failedCount > 0) {
      logger.warn(`告警发送失败: ${failedCount}/${this.adminChatIds.length} 个管理员`);
    }
  }

  /**
   * 添加自定义告警规则
   */
  static addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    logger.info(`添加告警规则: ${rule.name}`);
  }

  /**
   * 移除告警规则
   */
  static removeAlertRule(ruleName: string): boolean {
    const index = this.alertRules.findIndex(rule => rule.name === ruleName);
    if (index >= 0) {
      this.alertRules.splice(index, 1);
      logger.info(`移除告警规则: ${ruleName}`);
      return true;
    }
    return false;
  }

  /**
   * 获取当前系统状态
   */
  static async getCurrentStatus(): Promise<SystemMetrics> {
    return this.collectMetrics();
  }

  /**
   * 手动发送系统状态报告
   */
  static async sendStatusReport(): Promise<void> {
    const metrics = await this.collectMetrics();
    
    const report = `
📊 *系统状态报告*

**运行状态**: 正常
**运行时间**: ${Math.round(metrics.uptime / 3600)}小时

**内存使用**:
• 堆内存: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB
• 总内存: ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB
• 趋势: ${metrics.memoryTrend}

**性能指标**:
• 错误率: ${metrics.errorRate.toFixed(2)}%
• 平均响应: ${metrics.avgResponseTime.toFixed(2)}ms
• 成功率: ${metrics.systemLoad.successRate.toFixed(2)}%

**用户统计**:
• 活跃用户: ${metrics.activeUsers}
• 总用户数: ${metrics.totalUsers}

**缓存状态**:
${Object.entries(metrics.cacheStats)
  .map(([name, stats]) => `• ${name}: ${stats?.size || 0} 条目`)
  .join('\n')}

*报告时间: ${new Date().toLocaleString('zh-CN')}*
    `.trim();

    await this.sendAlertToAdmins(report);
  }

  /**
   * 停止监控
   */
  static shutdown(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    this.lastAlerts.clear();
    logger.info('监控服务已关闭');
  }

  /**
   * 获取告警历史
   */
  static getAlertHistory(): Array<{rule: string, lastTriggered: number}> {
    return Array.from(this.lastAlerts.entries()).map(([rule, time]) => ({
      rule,
      lastTriggered: time
    }));
  }
} 