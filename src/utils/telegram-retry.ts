import { logger } from './logger';
import { PerformanceMonitor } from './performance-monitor';

interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  timeoutMs: number;
}

// 增加熔断器状态管理
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  threshold: number;
  resetTimeoutMs: number;
}

export class TelegramRetryHandler {
  private static defaultOptions: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,      // 1秒基础延迟
    maxDelay: 10000,      // 最大10秒延迟
    timeoutMs: 30000      // 30秒超时
  };

  // 熔断器状态管理
  private static circuitBreakers = new Map<string, CircuitBreakerState>();
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5; // 5次失败后熔断
  private static readonly CIRCUIT_BREAKER_RESET_TIME = 60000; // 1分钟后尝试恢复

  /**
   * 带重试机制的 Telegram API 调用
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    
    // 检查熔断器状态
    if (this.isCircuitBreakerOpen(operationName)) {
      const error = new Error(`熔断器开启: ${operationName} 暂时不可用`);
      logger.warn(error.message);
      throw error;
    }

    return PerformanceMonitor.monitorAsync(
      async () => {
        let lastError: Error;

        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
          try {
            // 创建超时Promise
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Operation timeout')), config.timeoutMs);
            });

            // 执行操作，带超时控制
            const result = await Promise.race([operation(), timeoutPromise]);
            
            // 成功时重置熔断器
            this.resetCircuitBreaker(operationName);
            
            if (attempt > 1) {
              logger.info(`${operationName} 在第${attempt}次尝试后成功`);
            }
            
            return result;
          } catch (error) {
            lastError = error as Error;
            
            // 记录失败到熔断器
            this.recordFailure(operationName);
            
            // 判断是否需要重试
            if (!this.shouldRetry(error, attempt, config.maxRetries)) {
              throw error;
            }

            // 计算延迟时间 (指数退避 + 抖动)
            const baseDelay = config.baseDelay * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 0.1 * baseDelay; // 10%抖动
            const delay = Math.min(baseDelay + jitter, config.maxDelay);

            logger.warn(
              `${operationName} 第${attempt}次尝试失败: ${lastError.message}, ` +
              `${delay}ms后重试...`
            );

            // 延迟后重试
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        logger.error(`${operationName} 在${config.maxRetries}次尝试后仍然失败`);
        throw lastError!;
      },
      `telegram_retry_${operationName.replace(/\s+/g, '_')}`
    );
  }

  /**
   * 熔断器相关方法
   */
  private static isCircuitBreakerOpen(operationName: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(operationName);
    if (!circuitBreaker) return false;

    const now = Date.now();
    
    switch (circuitBreaker.state) {
      case 'closed':
        return false;
      case 'open':
        // 检查是否可以尝试恢复
        if (now - circuitBreaker.lastFailureTime > circuitBreaker.resetTimeoutMs) {
          circuitBreaker.state = 'half-open';
          logger.info(`熔断器 ${operationName} 进入半开状态`);
          return false;
        }
        return true;
      case 'half-open':
        return false;
      default:
        return false;
    }
  }

  private static recordFailure(operationName: string): void {
    let circuitBreaker = this.circuitBreakers.get(operationName);
    
    if (!circuitBreaker) {
      circuitBreaker = {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed',
        threshold: this.CIRCUIT_BREAKER_THRESHOLD,
        resetTimeoutMs: this.CIRCUIT_BREAKER_RESET_TIME
      };
      this.circuitBreakers.set(operationName, circuitBreaker);
    }

    circuitBreaker.failures++;
    circuitBreaker.lastFailureTime = Date.now();

    // 检查是否需要开启熔断器
    if (circuitBreaker.failures >= circuitBreaker.threshold && circuitBreaker.state === 'closed') {
      circuitBreaker.state = 'open';
      logger.warn(`熔断器 ${operationName} 已开启，失败次数: ${circuitBreaker.failures}`);
    } else if (circuitBreaker.state === 'half-open') {
      // 半开状态下失败，重新开启熔断器
      circuitBreaker.state = 'open';
      logger.warn(`熔断器 ${operationName} 重新开启`);
    }
  }

  private static resetCircuitBreaker(operationName: string): void {
    const circuitBreaker = this.circuitBreakers.get(operationName);
    if (circuitBreaker && circuitBreaker.state !== 'closed') {
      circuitBreaker.failures = 0;
      circuitBreaker.state = 'closed';
      logger.info(`熔断器 ${operationName} 已重置`);
    }
  }

  /**
   * 判断错误是否应该重试
   */
  private static shouldRetry(error: any, attempt: number, maxRetries: number): boolean {
    // 最后一次尝试不重试
    if (attempt >= maxRetries) {
      return false;
    }

    // 网络相关错误应该重试
    const networkErrors = [
      'ECONNRESET',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNABORTED',
      'EPIPE',
      'EHOSTUNREACH'
    ];

    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';

    // 检查网络错误
    if (networkErrors.some(netErr => 
      errorMessage.includes(netErr) || errorCode === netErr
    )) {
      return true;
    }

    // Telegram API 限流错误
    if (errorMessage.includes('Too Many Requests') || errorCode === 429) {
      return true;
    }

    // 超时错误
    if (errorMessage.includes('timeout') || errorMessage.includes('Operation timeout')) {
      return true;
    }

    // 5xx 服务器错误
    if (error?.response?.status >= 500) {
      return true;
    }

    // FetchError 或 TelegramError
    if (error?.name === 'FetchError' || error?.name === 'TelegramError') {
      return true;
    }

    return false;
  }

  /**
   * 包装 NotificationService 的方法
   */
  static async sendMessageWithRetry(
    sendFunction: () => Promise<any>,
    userId: number,
    operationName: string = 'sendMessage'
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        sendFunction,
        `${operationName} to user ${userId}`,
        {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 8000,
          timeoutMs: 30000
        }
      );
      return true;
    } catch (error) {
      logger.error(`${operationName} 最终失败 (用户${userId}):`, error);
      return false;
    }
  }

  /**
   * 批量发送消息的重试处理
   */
  static async sendBatchWithRetry<T>(
    operations: Array<{ fn: () => Promise<T>; name: string; id: string | number }>,
    options: Partial<RetryOptions> = {}
  ): Promise<{ success: T[]; failed: Array<{ id: string | number; error: Error }> }> {
    const config = { ...this.defaultOptions, ...options };
    const success: T[] = [];
    const failed: Array<{ id: string | number; error: Error }> = [];

    // 添加延迟以避免请求过快
    const delayBetweenRequests = 100; // 100ms间隔

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      
      try {
        const result = await this.executeWithRetry(
          operation.fn,
          `${operation.name} (${operation.id})`,
          config
        );
        success.push(result);
        
        // 添加请求间隔，除了最后一个请求
        if (i < operations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
      } catch (error) {
        failed.push({ id: operation.id, error: error as Error });
        logger.error(`批量操作失败: ${operation.name} (${operation.id})`, error);
      }
    }

    return { success, failed };
  }

  /**
   * 安全的 ctx.reply 包装器，带重试机制
   */
  static async safeReply(
    ctx: any,
    message: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.reply(message, options),
        `reply to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全回复失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }

  /**
   * 安全的 ctx.replyWithPhoto 包装器
   */
  static async safeReplyWithPhoto(
    ctx: any,
    photo: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.replyWithPhoto(photo, options),
        `replyWithPhoto to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全图片回复失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }

  /**
   * 安全的 ctx.replyWithVoice 包装器
   */
  static async safeReplyWithVoice(
    ctx: any,
    voice: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.replyWithVoice(voice, options),
        `replyWithVoice to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全语音回复失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }

  /**
   * 安全的 ctx.replyWithVideo 包装器
   */
  static async safeReplyWithVideo(
    ctx: any,
    video: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.replyWithVideo(video, options),
        `replyWithVideo to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全视频回复失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }

  /**
   * 安全的 ctx.replyWithDocument 包装器
   */
  static async safeReplyWithDocument(
    ctx: any,
    document: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.replyWithDocument(document, options),
        `replyWithDocument to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全文档回复失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }

  /**
   * 安全的 ctx.answerCbQuery 包装器
   */
  static async safeAnswerCbQuery(
    ctx: any,
    text?: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.answerCbQuery(text, options),
        `answerCbQuery to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全回调查询回复失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }

  /**
   * 安全的 ctx.editMessageReplyMarkup 包装器
   */
  static async safeEditMessageReplyMarkup(
    ctx: any,
    markup: any
  ): Promise<boolean> {
    try {
      await this.executeWithRetry(
        () => ctx.editMessageReplyMarkup(markup),
        `editMessageReplyMarkup to user ${ctx.from?.id || 'unknown'}`,
        {
          maxRetries: 2,
          baseDelay: 500,
          maxDelay: 3000,
          timeoutMs: 15000
        }
      );
      return true;
    } catch (error) {
      logger.error(`安全编辑消息标记失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }
} 