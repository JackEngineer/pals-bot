import { logger } from './logger';

interface PerformanceMetrics {
  timestamp: number;
  duration: number;
  success: boolean;
  errorType?: string;
  memoryUsage?: NodeJS.MemoryUsage;
}

interface HealthMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage | null;
  activeConnections: number;
  dbHealth: boolean;
  telegramHealth: boolean;
  errorRate: number;
  avgResponseTime: number;
}

export class PerformanceMonitor {
  private static metrics: Map<string, PerformanceMetrics[]> = new Map();
  private static readonly MAX_METRICS_PER_TYPE = 1000;
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5分钟
  private static cleanupTimer: NodeJS.Timeout | null = null;
  private static cpuUsageRef: NodeJS.CpuUsage | null = null;

  /**
   * 初始化性能监控
   */
  static initialize(): void {
    // 记录初始CPU使用情况
    this.cpuUsageRef = process.cpuUsage();
    
    // 启动定期清理
    this.startCleanup();
    
    // 监听内存警告
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        logger.warn('内存监听器超出限制:', warning);
      }
    });

    logger.info('性能监控器已初始化');
  }

  /**
   * 监控异步操作性能
   */
  static async monitorAsync<T>(
    operation: () => Promise<T>,
    operationType: string,
    includeMemory: boolean = false
  ): Promise<T> {
    const startTime = Date.now();
    const startMemory = includeMemory ? process.memoryUsage() : undefined;
    
    try {
      const result = await operation();
      
      this.recordMetric(operationType, {
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: true,
        memoryUsage: startMemory
      });
      
      return result;
    } catch (error) {
      this.recordMetric(operationType, {
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        memoryUsage: startMemory
      });
      
      throw error;
    }
  }

  /**
   * 监控同步操作性能
   */
  static monitorSync<T>(
    operation: () => T,
    operationType: string,
    includeMemory: boolean = false
  ): T {
    const startTime = Date.now();
    const startMemory = includeMemory ? process.memoryUsage() : undefined;
    
    try {
      const result = operation();
      
      this.recordMetric(operationType, {
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: true,
        memoryUsage: startMemory
      });
      
      return result;
    } catch (error) {
      this.recordMetric(operationType, {
        timestamp: startTime,
        duration: Date.now() - startTime,
        success: false,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        memoryUsage: startMemory
      });
      
      throw error;
    }
  }

  /**
   * 记录指标
   */
  private static recordMetric(type: string, metric: PerformanceMetrics): void {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, []);
    }
    
    const metrics = this.metrics.get(type)!;
    metrics.push(metric);
    
    // 限制指标数量
    if (metrics.length > this.MAX_METRICS_PER_TYPE) {
      metrics.splice(0, metrics.length - this.MAX_METRICS_PER_TYPE);
    }
  }

  /**
   * 获取操作统计
   */
  static getOperationStats(operationType: string, timeWindowMs?: number): {
    totalCalls: number;
    successRate: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    errorTypes: Record<string, number>;
  } {
    const metrics = this.metrics.get(operationType) || [];
    const now = Date.now();
    
    const filteredMetrics = timeWindowMs 
      ? metrics.filter(m => now - m.timestamp <= timeWindowMs)
      : metrics;

    if (filteredMetrics.length === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: 0,
        errorTypes: {}
      };
    }

    const successCount = filteredMetrics.filter(m => m.success).length;
    const durations = filteredMetrics.map(m => m.duration);
    const errorTypes: Record<string, number> = {};

    filteredMetrics
      .filter(m => !m.success && m.errorType)
      .forEach(m => {
        errorTypes[m.errorType!] = (errorTypes[m.errorType!] || 0) + 1;
      });

    return {
      totalCalls: filteredMetrics.length,
      successRate: (successCount / filteredMetrics.length) * 100,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      errorTypes
    };
  }

  /**
   * 获取系统健康状态
   */
  static async getHealthMetrics(): Promise<HealthMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = this.cpuUsageRef ? process.cpuUsage(this.cpuUsageRef) : null;
    
    // 更新CPU基准
    this.cpuUsageRef = process.cpuUsage();

    // 计算整体错误率
    let totalCalls = 0;
    let totalErrors = 0;
    let totalDuration = 0;

    for (const [, metrics] of this.metrics) {
      const recentMetrics = metrics.filter(m => Date.now() - m.timestamp <= 5 * 60 * 1000);
      totalCalls += recentMetrics.length;
      totalErrors += recentMetrics.filter(m => !m.success).length;
      totalDuration += recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    }

    const errorRate = totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0;
    const avgResponseTime = totalCalls > 0 ? totalDuration / totalCalls : 0;

    return {
      uptime: process.uptime(),
      memoryUsage,
      cpuUsage,
      activeConnections: 0, // 这个需要根据具体情况实现
      dbHealth: true, // 这个需要检查数据库连接状态
      telegramHealth: true, // 这个需要检查Telegram连接状态
      errorRate,
      avgResponseTime
    };
  }

  /**
   * 获取内存使用报告
   */
  static getMemoryReport(): {
    current: NodeJS.MemoryUsage;
    trend: 'increasing' | 'decreasing' | 'stable';
    warning: boolean;
  } {
    const current = process.memoryUsage();
    const recentMetrics = Array.from(this.metrics.values())
      .flat()
      .filter(m => m.memoryUsage && Date.now() - m.timestamp <= 10 * 60 * 1000)
      .map(m => m.memoryUsage!.heapUsed);

    if (recentMetrics.length < 2) {
      return {
        current,
        trend: 'stable',
        warning: false
      };
    }

    const oldestUsage = recentMetrics[0];
    const newestUsage = recentMetrics[recentMetrics.length - 1];
    const change = (newestUsage - oldestUsage) / oldestUsage;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (change > 0.1) trend = 'increasing';
    else if (change < -0.1) trend = 'decreasing';

    // 内存使用超过1GB时发出警告
    const warning = current.heapUsed > 1024 * 1024 * 1024;

    return { current, trend, warning };
  }

  /**
   * 启动清理定时器
   */
  private static startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 清理过期指标
   */
  private static cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30分钟

    for (const [type, metrics] of this.metrics) {
      const validMetrics = metrics.filter(m => now - m.timestamp <= maxAge);
      this.metrics.set(type, validMetrics);
    }

    logger.debug('性能指标清理完成');
  }

  /**
   * 停止监控
   */
  static shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.metrics.clear();
    logger.info('性能监控器已关闭');
  }

  /**
   * 导出指标数据
   */
  static exportMetrics(): Record<string, PerformanceMetrics[]> {
    const exported: Record<string, PerformanceMetrics[]> = {};
    for (const [type, metrics] of this.metrics) {
      exported[type] = [...metrics];
    }
    return exported;
  }
} 