import { logger } from './logger';
import { PerformanceMonitor } from './performance-monitor';

interface CacheEntry<T> {
  value: T;
  expiredAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheOptions {
  ttl: number; // 生存时间（毫秒）
  maxSize: number; // 最大缓存条目数
  cleanupInterval: number; // 清理间隔（毫秒）
}

export class CacheManager {
  private static caches = new Map<string, Map<string, CacheEntry<any>>>();
  private static cleanupTimers = new Map<string, NodeJS.Timeout>();
  
  /**
   * 创建或获取缓存实例
   */
  static createCache<T>(
    cacheName: string, 
    options: CacheOptions = {
      ttl: 5 * 60 * 1000, // 默认5分钟
      maxSize: 1000,
      cleanupInterval: 60 * 1000 // 1分钟清理一次
    }
  ): CacheInstance<T> {
    if (!this.caches.has(cacheName)) {
      this.caches.set(cacheName, new Map());
      this.startCleanup(cacheName, options);
      logger.info(`缓存 ${cacheName} 已创建`, options);
    }
    
    return new CacheInstance<T>(cacheName, options);
  }

  /**
   * 启动清理定时器
   */
  private static startCleanup(cacheName: string, options: CacheOptions): void {
    const timer = setInterval(() => {
      this.cleanup(cacheName, options);
    }, options.cleanupInterval);
    
    this.cleanupTimers.set(cacheName, timer);
  }

  /**
   * 清理过期缓存
   */
  private static cleanup(cacheName: string, options: CacheOptions): void {
    const cache = this.caches.get(cacheName);
    if (!cache) return;

    const now = Date.now();
    let cleanedCount = 0;
    let evictedCount = 0;

    // 清理过期条目
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiredAt) {
        cache.delete(key);
        cleanedCount++;
      }
    }

    // 如果缓存仍然超过大小限制，清理最少使用的条目
    if (cache.size > options.maxSize) {
      const entries = Array.from(cache.entries())
        .sort(([, a], [, b]) => {
          // 按访问次数和最后访问时间排序
          const scoreA = a.accessCount * 0.7 + (now - a.lastAccessed) * 0.3;
          const scoreB = b.accessCount * 0.7 + (now - b.lastAccessed) * 0.3;
          return scoreA - scoreB;
        });

      const toEvict = entries.slice(0, cache.size - options.maxSize + 1);
      toEvict.forEach(([key]) => {
        cache.delete(key);
        evictedCount++;
      });
    }

    if (cleanedCount > 0 || evictedCount > 0) {
      logger.debug(`缓存 ${cacheName} 清理完成: 过期${cleanedCount}个, 淘汰${evictedCount}个, 剩余${cache.size}个`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  static getCacheStats(cacheName: string): {
    size: number;
    hitRate: number;
    avgAccessCount: number;
    oldestEntry: number;
    newestEntry: number;
  } | null {
    const cache = this.caches.get(cacheName);
    if (!cache) return null;

    const entries = Array.from(cache.values());
    if (entries.length === 0) {
      return {
        size: 0,
        hitRate: 0,
        avgAccessCount: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }

    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const createdTimes = entries.map(entry => entry.createdAt);

    return {
      size: cache.size,
      hitRate: totalAccess / entries.length, // 简化的命中率计算
      avgAccessCount: totalAccess / entries.length,
      oldestEntry: Math.min(...createdTimes),
      newestEntry: Math.max(...createdTimes)
    };
  }

  /**
   * 清空指定缓存
   */
  static clearCache(cacheName: string): void {
    const cache = this.caches.get(cacheName);
    if (cache) {
      cache.clear();
      logger.info(`缓存 ${cacheName} 已清空`);
    }
  }

  /**
   * 关闭所有缓存
   */
  static shutdown(): void {
    // 停止所有清理定时器
    for (const [cacheName, timer] of this.cleanupTimers) {
      clearInterval(timer);
    }
    this.cleanupTimers.clear();

    // 清空所有缓存
    this.caches.clear();
    logger.info('所有缓存已关闭');
  }

  /**
   * 获取所有缓存信息
   */
  static getAllCacheStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const cacheName of this.caches.keys()) {
      stats[cacheName] = this.getCacheStats(cacheName);
    }
    
    return stats;
  }
}

export class CacheInstance<T> {
  constructor(
    private cacheName: string,
    private options: CacheOptions
  ) {}

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    const cache = CacheManager['caches'].get(this.cacheName);
    if (!cache) return;

    const actualTtl = ttl || this.options.ttl;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      expiredAt: now + actualTtl,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now
    };

    cache.set(key, entry);
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | null {
    return PerformanceMonitor.monitorSync(
      () => this._get(key),
      `cache_${this.cacheName}_get`
    );
  }

  private _get(key: string): T | null {
    const cache = CacheManager['caches'].get(this.cacheName);
    if (!cache) return null;

    const entry = cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    
    // 检查是否过期
    if (now > entry.expiredAt) {
      cache.delete(key);
      return null;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessed = now;

    return entry.value;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const cache = CacheManager['caches'].get(this.cacheName);
    if (!cache) return false;

    return cache.delete(key);
  }

  /**
   * 检查键是否存在且未过期
   */
  has(key: string): boolean {
    const cache = CacheManager['caches'].get(this.cacheName);
    if (!cache) return false;

    const entry = cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now > entry.expiredAt) {
      cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 获取或设置缓存值（如果不存在则执行函数）
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    return PerformanceMonitor.monitorAsync(
      () => this._getOrSet(key, factory, ttl),
      `cache_${this.cacheName}_getOrSet`
    );
  }

  private async _getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // 尝试从缓存获取
    const cached = this._get(key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，执行工厂函数
    try {
      const value = await factory();
      this.set(key, value, ttl);
      return value;
    } catch (error) {
      logger.error(`缓存 ${this.cacheName} 工厂函数执行失败 (key: ${key}):`, error);
      throw error;
    }
  }

  /**
   * 批量获取
   */
  mget(keys: string[]): Map<string, T> {
    return PerformanceMonitor.monitorSync(
      () => {
        const result = new Map<string, T>();
        
        for (const key of keys) {
          const value = this._get(key);
          if (value !== null) {
            result.set(key, value);
          }
        }
        
        return result;
      },
      `cache_${this.cacheName}_mget`
    );
  }

  /**
   * 批量设置
   */
  mset(entries: Map<string, T>, ttl?: number): void {
    for (const [key, value] of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * 清空当前缓存实例
   */
  clear(): void {
    CacheManager.clearCache(this.cacheName);
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return CacheManager.getCacheStats(this.cacheName);
  }

  /**
   * 使用模式：缓存函数结果
   */
  wrap<Args extends any[], Return extends T>(
    fn: (...args: Args) => Promise<Return>,
    keyGenerator: (...args: Args) => string,
    ttl?: number
  ): (...args: Args) => Promise<Return> {
    return async (...args: Args): Promise<Return> => {
      const key = keyGenerator(...args);
      return this.getOrSet(key, () => fn(...args), ttl) as Promise<Return>;
    };
  }
}

// 预定义的常用缓存实例
export const UserCache = CacheManager.createCache('users', {
  ttl: 10 * 60 * 1000, // 10分钟
  maxSize: 5000,
  cleanupInterval: 2 * 60 * 1000 // 2分钟清理
});

export const StatsCache = CacheManager.createCache('stats', {
  ttl: 5 * 60 * 1000, // 5分钟
  maxSize: 100,
  cleanupInterval: 60 * 1000 // 1分钟清理
});

export const LeaderboardCache = CacheManager.createCache('leaderboard', {
  ttl: 30 * 60 * 1000, // 30分钟
  maxSize: 50,
  cleanupInterval: 5 * 60 * 1000 // 5分钟清理
});

export const ShopCache = CacheManager.createCache('shop', {
  ttl: 60 * 60 * 1000, // 1小时
  maxSize: 200,
  cleanupInterval: 10 * 60 * 1000 // 10分钟清理
}); 