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

  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // 1秒
  private static readonly NETWORK_ERROR_CODES = [
    'ECONNRESET',
    'ECONNREFUSED', 
    'ETIMEDOUT',
    'ENETDOWN',
    'ENETUNREACH',
    'EHOSTDOWN',
    'EHOSTUNREACH'
  ];

  /**
   * 带重试机制的 Telegram API 调用
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isLastAttempt = attempt === retries;
        const isNetworkError = this.isNetworkError(error);
        const shouldRetry = this.shouldRetry(error, attempt, retries);

        // 记录错误信息
        logger.warn(`${operationName} 失败 (尝试 ${attempt}/${retries}):`, {
          error: error.message,
          code: error.code,
          isNetworkError,
          willRetry: shouldRetry
        });

        if (!shouldRetry || isLastAttempt) {
          // 最后一次尝试失败，抛出错误
          throw new Error(`${operationName} 最终失败: ${error.message}`);
        }

        // 等待后重试
        const delay = this.calculateDelay(attempt, isNetworkError);
        logger.info(`等待 ${delay}ms 后重试...`);
        await this.sleep(delay);
      }
    }

    throw new Error(`${operationName} 重试次数已用完`);
  }

  /**
   * 判断是否为网络错误
   */
  private static isNetworkError(error: any): boolean {
    if (!error) return false;
    
    // 检查错误码
    if (error.code && this.NETWORK_ERROR_CODES.includes(error.code)) {
      return true;
    }

    // 检查错误消息
    const message = error.message?.toLowerCase() || '';
    return message.includes('network') || 
           message.includes('connection') || 
           message.includes('timeout') ||
           message.includes('reset') ||
           message.includes('refused');
  }

  /**
   * 判断是否应该重试
   */
  private static shouldRetry(error: any, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;

    // 网络错误总是重试
    if (this.isNetworkError(error)) return true;

    // Telegram API特定错误处理
    if (error.response) {
      const status = error.response.status;
      
      // 4xx客户端错误一般不重试
      if (status >= 400 && status < 500) {
        // 但429 Too Many Requests需要重试
        return status === 429;
      }
      
      // 5xx服务器错误重试
      if (status >= 500) return true;
    }

    // 其他未知错误重试
    return true;
  }

  /**
   * 计算延迟时间（指数退避）
   */
  private static calculateDelay(attempt: number, isNetworkError: boolean): number {
    const baseDelay = isNetworkError ? this.RETRY_DELAY * 2 : this.RETRY_DELAY;
    return baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
  }

  /**
   * 睡眠指定毫秒
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 安全的Telegram API调用封装
   */
  static async safeTelegramCall<T>(
    operation: () => Promise<T>,
    operationName: string,
    fallbackValue?: T
  ): Promise<T | null> {
    try {
      return await this.executeWithRetry(operation, operationName);
    } catch (error) {
      logger.error(`Telegram API调用最终失败: ${operationName}`, error);
      
      if (fallbackValue !== undefined) {
        logger.info(`使用fallback值: ${fallbackValue}`);
        return fallbackValue;
      }
      
      return null;
    }
  }

  /**
   * 批量API调用（控制并发）
   */
  static async batchExecute<T>(
    operations: (() => Promise<T>)[],
    operationName: string,
    concurrency: number = 3
  ): Promise<(T | null)[]> {
    const results: (T | null)[] = [];
    
    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      const batchPromises = batch.map((op, index) => 
        this.safeTelegramCall(op, `${operationName}[${i + index}]`)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // 批次间添加小延迟，避免频率限制
      if (i + concurrency < operations.length) {
        await this.sleep(100);
      }
    }
    
    return results;
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
        3 // 重试3次
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
    maxRetries: number = 3
  ): Promise<{ success: T[]; failed: Array<{ id: string | number; error: Error }> }> {
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
          maxRetries
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
        2 // 重试2次
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
        2 // 重试2次
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
        2 // 重试2次
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
        2 // 重试2次
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
        2 // 重试2次
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
        2 // 重试2次
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
        2 // 重试2次
      );
      return true;
    } catch (error) {
      logger.error(`安全编辑消息标记失败 (用户${ctx.from?.id || 'unknown'}):`, error);
      return false;
    }
  }
} 