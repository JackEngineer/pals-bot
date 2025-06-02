import { logger } from './logger';
import { PerformanceMonitor } from './performance-monitor';

interface PooledConnection<T> {
  resource: T;
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
  useCount: number;
}

interface PoolOptions {
  min: number;
  max: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
  acquireTimeoutMs: number;
  testOnBorrow: boolean;
  testOnReturn: boolean;
}

export class ConnectionPool<T> {
  private pool: PooledConnection<T>[] = [];
  private pendingAcquires: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly poolName: string;

  constructor(
    private factory: () => Promise<T>,
    private destroyer: (resource: T) => Promise<void>,
    private validator: (resource: T) => Promise<boolean>,
    private options: PoolOptions,
    poolName: string = 'DefaultPool'
  ) {
    this.poolName = poolName;
    this.startCleanup();
    logger.info(`连接池 ${this.poolName} 已初始化`, {
      minConnections: options.min,
      maxConnections: options.max
    });
  }

  /**
   * 初始化最小连接数
   */
  async initialize(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < this.options.min; i++) {
      promises.push(this.createConnection());
    }
    
    await Promise.all(promises);
    logger.info(`连接池 ${this.poolName} 初始化完成，创建了 ${this.options.min} 个连接`);
  }

  /**
   * 获取连接
   */
  async acquire(): Promise<T> {
    return PerformanceMonitor.monitorAsync(
      () => this._acquire(),
      `${this.poolName}_acquire`
    );
  }

  private async _acquire(): Promise<T> {
    // 查找可用连接
    const availableConnection = this.pool.find(conn => !conn.inUse);
    
    if (availableConnection) {
      // 验证连接是否有效
      if (this.options.testOnBorrow) {
        try {
          const isValid = await this.validator(availableConnection.resource);
          if (!isValid) {
            await this.removeConnection(availableConnection);
            return this._acquire(); // 递归获取新连接
          }
        } catch (error) {
          logger.warn(`连接验证失败，移除连接:`, error);
          await this.removeConnection(availableConnection);
          return this._acquire();
        }
      }
      
      availableConnection.inUse = true;
      availableConnection.lastUsed = Date.now();
      availableConnection.useCount++;
      
      return availableConnection.resource;
    }

    // 如果池未满，创建新连接
    if (this.pool.length < this.options.max) {
      const resource = await this.factory();
      const connection: PooledConnection<T> = {
        resource,
        inUse: true,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        useCount: 1
      };
      
      this.pool.push(connection);
      logger.debug(`连接池 ${this.poolName} 创建新连接，当前池大小: ${this.pool.length}`);
      
      return resource;
    }

    // 等待连接释放
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pendingAcquires.findIndex(p => p.resolve === resolve);
        if (index >= 0) {
          this.pendingAcquires.splice(index, 1);
        }
        reject(new Error(`获取连接超时 (${this.options.acquireTimeoutMs}ms) - ${this.poolName}`));
      }, this.options.acquireTimeoutMs);

      this.pendingAcquires.push({
        resolve,
        reject,
        timeoutId
      });
    });
  }

  /**
   * 释放连接
   */
  async release(resource: T): Promise<void> {
    return PerformanceMonitor.monitorAsync(
      () => this._release(resource),
      `${this.poolName}_release`
    );
  }

  private async _release(resource: T): Promise<void> {
    const connection = this.pool.find(conn => conn.resource === resource);
    
    if (!connection) {
      logger.warn(`尝试释放不存在的连接 - ${this.poolName}`);
      return;
    }

    // 验证连接是否还有效
    if (this.options.testOnReturn) {
      try {
        const isValid = await this.validator(resource);
        if (!isValid) {
          await this.removeConnection(connection);
          this.processPendingAcquires();
          return;
        }
      } catch (error) {
        logger.warn(`连接返回时验证失败，移除连接:`, error);
        await this.removeConnection(connection);
        this.processPendingAcquires();
        return;
      }
    }

    // 检查连接是否过期
    const now = Date.now();
    if (now - connection.createdAt > this.options.maxLifetimeMs) {
      logger.debug(`连接已过期，移除连接 - ${this.poolName}`);
      await this.removeConnection(connection);
      this.processPendingAcquires();
      return;
    }

    connection.inUse = false;
    connection.lastUsed = now;

    // 处理等待中的请求
    this.processPendingAcquires();
  }

  /**
   * 处理等待中的获取请求
   */
  private processPendingAcquires(): void {
    if (this.pendingAcquires.length === 0) return;

    const availableConnection = this.pool.find(conn => !conn.inUse);
    if (availableConnection) {
      const pending = this.pendingAcquires.shift()!;
      clearTimeout(pending.timeoutId);
      
      availableConnection.inUse = true;
      availableConnection.lastUsed = Date.now();
      availableConnection.useCount++;
      
      pending.resolve(availableConnection.resource);
      
      // 递归处理剩余请求
      this.processPendingAcquires();
    }
  }

  /**
   * 创建新连接
   */
  private async createConnection(): Promise<void> {
    try {
      const resource = await this.factory();
      const connection: PooledConnection<T> = {
        resource,
        inUse: false,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        useCount: 0
      };
      
      this.pool.push(connection);
    } catch (error) {
      logger.error(`创建连接失败 - ${this.poolName}:`, error);
      throw error;
    }
  }

  /**
   * 移除连接
   */
  private async removeConnection(connection: PooledConnection<T>): Promise<void> {
    const index = this.pool.indexOf(connection);
    if (index >= 0) {
      this.pool.splice(index, 1);
      
      try {
        await this.destroyer(connection.resource);
      } catch (error) {
        logger.error(`销毁连接失败 - ${this.poolName}:`, error);
      }
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanup(): void {
    const cleanupInterval = Math.min(this.options.idleTimeoutMs, 60000); // 最多1分钟检查一次
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, cleanupInterval);
  }

  /**
   * 清理过期和空闲连接
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: PooledConnection<T>[] = [];

    for (const connection of this.pool) {
      // 跳过正在使用的连接
      if (connection.inUse) continue;

      // 检查连接是否过期
      if (now - connection.createdAt > this.options.maxLifetimeMs) {
        connectionsToRemove.push(connection);
        continue;
      }

      // 检查连接是否空闲太久
      if (now - connection.lastUsed > this.options.idleTimeoutMs) {
        // 保持最小连接数
        if (this.pool.length - connectionsToRemove.length > this.options.min) {
          connectionsToRemove.push(connection);
        }
      }
    }

    // 移除标记的连接
    for (const connection of connectionsToRemove) {
      await this.removeConnection(connection);
    }

    if (connectionsToRemove.length > 0) {
      logger.debug(`连接池 ${this.poolName} 清理了 ${connectionsToRemove.length} 个连接，当前池大小: ${this.pool.length}`);
    }
  }

  /**
   * 获取池状态
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    pendingAcquires: number;
    poolName: string;
  } {
    const activeConnections = this.pool.filter(conn => conn.inUse).length;
    
    return {
      totalConnections: this.pool.length,
      activeConnections,
      idleConnections: this.pool.length - activeConnections,
      pendingAcquires: this.pendingAcquires.length,
      poolName: this.poolName
    };
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    // 清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 拒绝所有等待中的请求
    for (const pending of this.pendingAcquires) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`连接池 ${this.poolName} 正在关闭`));
    }
    this.pendingAcquires.length = 0;

    // 关闭所有连接
    const promises = this.pool.map(conn => this.destroyer(conn.resource));
    await Promise.allSettled(promises);
    
    this.pool.length = 0;
    logger.info(`连接池 ${this.poolName} 已关闭`);
  }

  /**
   * 使用连接执行操作
   */
  async execute<R>(operation: (resource: T) => Promise<R>): Promise<R> {
    const resource = await this.acquire();
    
    try {
      return await operation(resource);
    } finally {
      await this.release(resource);
    }
  }
} 