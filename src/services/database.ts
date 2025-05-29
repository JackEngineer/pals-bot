import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

let db: sqlite3.Database;

export interface Bottle {
    id: string;
    sender_id: number;
    sender_username?: string;
    content: string;
    media_type?: 'photo' | 'voice' | 'video' | 'document';
    media_file_id?: string;
    created_at: string;
    picked_at?: string;
    picked_by?: number;
    is_active: boolean;
}

export interface Reply {
    id: string;
    bottle_id: string;
    sender_id: number;
    sender_username?: string;
    content: string;
    media_type?: 'photo' | 'voice' | 'video' | 'document';
    media_file_id?: string;
    created_at: string;
}

export interface UserStats {
    user_id: number;
    username?: string;
    bottles_thrown: number;
    bottles_picked: number;
    last_throw_time?: string;
    last_pick_time?: string;
}

export const setupDatabase = async (): Promise<void> => {
    const dbPath = process.env.DATABASE_PATH || './data/bot.db';
    const dbDir = path.dirname(dbPath);

    // 确保数据目录存在
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // 如果数据库已连接，先关闭
    if (db) {
        try {
            await new Promise<void>((resolve) => {
                db.close((err) => {
                    if (err) logger.warn('关闭旧数据库连接时出错:', err);
                    resolve();
                });
            });
        } catch (error) {
            logger.warn('关闭旧数据库连接失败:', error);
        }
    }

    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
            if (err) {
                logger.error('数据库连接失败:', err);
                reject(err);
                return;
            }

            logger.info(`数据库连接成功: ${dbPath}`);
            
            try {
                // 配置 SQLite 性能和并发设置
                const executePragmas = async () => {
                    const run = promisify(db.run.bind(db));
                    
                    // 先设置基本的安全模式
                    await run('PRAGMA busy_timeout = 30000');
                    await run('PRAGMA foreign_keys = ON');
                    
                    // 检查当前journal模式
                    const currentMode = await new Promise<{ journal_mode: string }>((pragmaResolve, pragmaReject) => {
                        db.get('PRAGMA journal_mode', (pragmaErr, row: any) => {
                            if (pragmaErr) pragmaReject(pragmaErr);
                            else pragmaResolve(row);
                        });
                    });
                    
                    logger.info(`当前journal模式: ${currentMode.journal_mode}`);
                    
                    // 如果不是WAL模式，则切换到WAL模式
                    if (currentMode.journal_mode.toLowerCase() !== 'wal') {
                        logger.info('切换到WAL模式...');
                        await run('PRAGMA journal_mode = WAL');
                    }
                    
                    // 设置性能优化参数
                    await run('PRAGMA cache_size = -64000'); // 64MB缓存
                    await run('PRAGMA temp_store = MEMORY');   // 临时存储在内存中
                    await run('PRAGMA mmap_size = 268435456'); // 256MB内存映射
                    await run('PRAGMA synchronous = NORMAL');  // 平衡安全性和性能
                    
                    logger.info('SQLite优化配置完成');
                };

                await executePragmas();
                await initializeTables();
                
                logger.info('数据库设置完成，已启用性能优化');
                resolve();
            } catch (setupError) {
                logger.error('数据库设置失败:', setupError);
                reject(setupError);
            }
        });
    });
};

const initializeTables = async (): Promise<void> => {
    const run = promisify(db.run.bind(db));

    try {
        // 漂流瓶表
        await run(`
            CREATE TABLE IF NOT EXISTS bottles (
                id TEXT PRIMARY KEY,
                sender_id INTEGER NOT NULL,
                sender_username TEXT,
                content TEXT NOT NULL,
                media_type TEXT,
                media_file_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                picked_at DATETIME,
                picked_by INTEGER,
                is_active BOOLEAN DEFAULT 1
            )
        `);

        // 回复表
        await run(`
            CREATE TABLE IF NOT EXISTS replies (
                id TEXT PRIMARY KEY,
                bottle_id TEXT NOT NULL,
                sender_id INTEGER NOT NULL,
                sender_username TEXT,
                content TEXT NOT NULL,
                media_type TEXT,
                media_file_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (bottle_id) REFERENCES bottles (id)
            )
        `);

        // 用户统计表
        await run(`
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                bottles_thrown INTEGER DEFAULT 0,
                bottles_picked INTEGER DEFAULT 0,
                last_throw_time DATETIME,
                last_pick_time DATETIME
            )
        `);

        // 用户积分表
        await run(`
            CREATE TABLE IF NOT EXISTS user_points (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                total_points INTEGER DEFAULT 0,
                available_points INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                level_name TEXT DEFAULT '🌊 新手水手',
                daily_checkin_streak INTEGER DEFAULT 0,
                last_checkin_date DATE,
                vip_expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 积分交易记录表
        await run(`
            CREATE TABLE IF NOT EXISTS points_transactions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
                action TEXT NOT NULL,
                description TEXT NOT NULL,
                reference_id TEXT,
                multiplier REAL DEFAULT 1.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user_points (user_id)
            )
        `);

        // 积分商店商品表
        await run(`
            CREATE TABLE IF NOT EXISTS points_shop_items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL CHECK (category IN ('privilege', 'decoration', 'special')),
                price INTEGER NOT NULL,
                duration_days INTEGER,
                is_active BOOLEAN DEFAULT 1,
                stock_limit INTEGER,
                level_required INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 用户购买记录表
        await run(`
            CREATE TABLE IF NOT EXISTS user_purchases (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                price INTEGER NOT NULL,
                status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'used')),
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user_points (user_id),
                FOREIGN KEY (item_id) REFERENCES points_shop_items (id)
            )
        `);

        // 成就表
        await run(`
            CREATE TABLE IF NOT EXISTS achievements (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                condition_type TEXT NOT NULL,
                condition_value INTEGER NOT NULL,
                reward_points INTEGER NOT NULL,
                icon TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 用户成就记录表
        await run(`
            CREATE TABLE IF NOT EXISTS user_achievements (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                achievement_id TEXT NOT NULL,
                achievement_name TEXT NOT NULL,
                reward_points INTEGER NOT NULL,
                unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user_points (user_id),
                FOREIGN KEY (achievement_id) REFERENCES achievements (id),
                UNIQUE(user_id, achievement_id)
            )
        `);

        // 创建索引
        await run(`CREATE INDEX IF NOT EXISTS idx_bottles_active ON bottles (is_active, created_at)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_bottles_sender ON bottles (sender_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_replies_bottle ON replies (bottle_id)`);

        // 创建积分相关索引
        await run(`CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON points_transactions (user_id, created_at)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON user_purchases (user_id, status)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_shop_items_category ON points_shop_items (category, is_active)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id)`);

        // 插入默认数据
        await insertDefaultData(run);

        logger.info('数据库表初始化完成（包含积分系统）');
    } catch (error) {
        logger.error('数据库表初始化失败:', error);
        throw error;
    }
};

// 插入默认数据的函数
const insertDefaultData = async (run: any): Promise<void> => {
    // 插入默认积分商店商品
    const defaultShopItems = [
        {
            id: 'extra_throws_5',
            name: '额外投放次数 +5',
            description: '增加每日漂流瓶投放限制5次',
            category: 'privilege',
            price: 100,
            duration_days: 1,
            level_required: 2
        },
        {
            id: 'no_cooldown_24h',
            name: '无冷却投放',
            description: '24小时内跳过投放时间限制',
            category: 'privilege',
            price: 150,
            duration_days: 1,
            level_required: 3
        },
        {
            id: 'selective_pick',
            name: '选择性捡拾',
            description: '可跳过不喜欢的瓶子重新捡拾',
            category: 'privilege',
            price: 300,
            duration_days: 7,
            level_required: 4
        },
        {
            id: 'vip_member_30d',
            name: '💎VIP会员',
            description: 'VIP标识，1.2倍积分，签到+3积分，特效漂流瓶',
            category: 'privilege',
            price: 200,
            duration_days: 30,
            level_required: 2
        },
        {
            id: 'colorful_message',
            name: '🎨彩色消息',
            description: '漂流瓶带特殊emoji装饰',
            category: 'decoration',
            price: 50,
            duration_days: 7,
            level_required: 1
        },
        {
            id: 'custom_signature',
            name: '📝自定义签名',
            description: '在漂流瓶末尾显示个人签名',
            category: 'decoration',
            price: 100,
            duration_days: 30,
            level_required: 2
        },
        {
            id: 'anonymous_mode',
            name: '🕶️匿名保护',
            description: '隐藏用户名显示',
            category: 'decoration',
            price: 80,
            duration_days: 1,
            level_required: 3
        },
        {
            id: 'double_points_24h',
            name: '💫双倍积分卡',
            description: '24小时内所有行为获得双倍积分',
            category: 'special',
            price: 250,
            duration_days: 1,
            level_required: 4
        },
        {
            id: 'lucky_boost_24h',
            name: '🍀幸运加成',
            description: '稀有瓶子概率+20%',
            category: 'special',
            price: 200,
            duration_days: 1,
            level_required: 4
        },
        {
            id: 'reply_priority_24h',
            name: '⭐回复优先',
            description: '你的瓶子更容易被其他用户看到',
            category: 'special',
            price: 100,
            duration_days: 1,
            level_required: 3
        }
    ];

    for (const item of defaultShopItems) {
        await run(`
            INSERT OR IGNORE INTO points_shop_items 
            (id, name, description, category, price, duration_days, level_required)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [item.id, item.name, item.description, item.category, item.price, item.duration_days, item.level_required]);
    }

    // 插入默认成就
    const defaultAchievements = [
        {
            id: 'first_throw',
            name: '初次航行',
            description: '投放第一个漂流瓶',
            condition_type: 'bottles_thrown',
            condition_value: 1,
            reward_points: 20,
            icon: '🎉'
        },
        {
            id: 'throw_master',
            name: '投放达人',
            description: '累计投放100个漂流瓶',
            condition_type: 'bottles_thrown',
            condition_value: 100,
            reward_points: 100,
            icon: '🏆'
        },
        {
            id: 'reply_expert',
            name: '回复专家',
            description: '累计回复50个漂流瓶',
            condition_type: 'replies_sent',
            condition_value: 50,
            reward_points: 80,
            icon: '💬'
        },
        {
            id: 'social_butterfly',
            name: '社交达人',
            description: '与20个不同用户互动',
            condition_type: 'unique_interactions',
            condition_value: 20,
            reward_points: 150,
            icon: '🦋'
        },
        {
            id: 'weekly_streaker',
            name: '签到达人',
            description: '连续签到7天',
            condition_type: 'checkin_streak',
            condition_value: 7,
            reward_points: 50,
            icon: '🔥'
        }
    ];

    for (const achievement of defaultAchievements) {
        await run(`
            INSERT OR IGNORE INTO achievements 
            (id, name, description, condition_type, condition_value, reward_points, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            achievement.id, 
            achievement.name, 
            achievement.description, 
            achievement.condition_type, 
            achievement.condition_value, 
            achievement.reward_points, 
            achievement.icon
        ]);
    }

    logger.info('默认积分系统数据插入完成');
};

export const getDatabase = (): sqlite3.Database => {
    if (!db) {
        throw new Error('数据库未初始化');
    }
    return db;
};

// 重试配置
const RETRY_CONFIG = {
    maxRetries: 5, // 增加重试次数
    baseDelay: 150, // 增加基础延迟 150ms
    maxDelay: 2000  // 增加最大延迟 2s
};

// 延迟函数
const delay = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

// 计算重试延迟（指数退避）
const getRetryDelay = (attempt: number): number => {
    const exponentialDelay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 添加10%的随机抖动
    return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelay);
};

// 检查是否为可重试的错误
const isRetryableError = (error: any): boolean => {
    if (!error) return false;
    const errorCode = error.code || error.errno;
    const errorMessage = error.message || '';
    
    // SQLite 可重试的错误类型
    return (
        errorCode === 'SQLITE_BUSY' ||
        errorCode === 'SQLITE_LOCKED' ||
        errorCode === 5 || // SQLITE_BUSY
        errorCode === 6 || // SQLITE_LOCKED
        errorMessage.includes('database is locked') ||
        errorMessage.includes('database is busy')
    );
};

// 带重试的数据库操作包装器
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // 如果不是可重试的错误，直接抛出
            if (!isRetryableError(error)) {
                logger.error(`${operationName} 失败 (不可重试):`, error);
                throw error;
            }
            
            // 如果是最后一次尝试，抛出错误
            if (attempt === RETRY_CONFIG.maxRetries) {
                logger.error(`${operationName} 失败 (重试 ${RETRY_CONFIG.maxRetries} 次后):`, error);
                throw error;
            }
            
            // 计算延迟并等待
            const retryDelay = getRetryDelay(attempt);
            logger.warn(`${operationName} 失败 (尝试 ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), ${retryDelay}ms 后重试:`, error);
            await delay(retryDelay);
        }
    }
    
    throw lastError;
}

// 数据库操作辅助函数（带重试机制）
export const dbGet = (sql: string, params: any[] = []): Promise<any> => {
    return withRetry(
        () => new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        }),
        `dbGet: ${sql.substring(0, 50)}...`
    );
};

export const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
    return withRetry(
        () => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }),
        `dbAll: ${sql.substring(0, 50)}...`
    );
};

export const dbRun = (sql: string, params: any[] = []): Promise<sqlite3.RunResult> => {
    return withRetry(
        () => new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        }),
        `dbRun: ${sql.substring(0, 50)}...`
    );
};

// 新增：事务支持函数
export const dbTransaction = async (operations: (() => Promise<any>)[]): Promise<any[]> => {
    return withRetry(
        async () => {
            return new Promise<any[]>((resolve, reject) => {
                db.serialize(async () => {
                    db.run('BEGIN TRANSACTION', async (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        try {
                            const results: any[] = [];
                            for (const operation of operations) {
                                const result = await operation();
                                results.push(result);
                            }

                            db.run('COMMIT', (commitErr) => {
                                if (commitErr) {
                                    reject(commitErr);
                                } else {
                                    resolve(results);
                                }
                            });
                        } catch (operationErr) {
                            db.run('ROLLBACK', (rollbackErr) => {
                                if (rollbackErr) {
                                    logger.error('事务回滚失败:', rollbackErr);
                                }
                                reject(operationErr);
                            });
                        }
                    });
                });
            });
        },
        'dbTransaction'
    );
};

// 新增：安全的数据库操作包装器
export const dbExecuteInTransaction = async <T>(
    callback: () => Promise<T>
): Promise<T> => {
    return withRetry(
        async () => {
            return new Promise<T>((resolve, reject) => {
                db.serialize(() => {
                    db.run('BEGIN IMMEDIATE', async (beginErr) => {
                        if (beginErr) {
                            reject(beginErr);
                            return;
                        }

                        try {
                            const result = await callback();
                            
                            db.run('COMMIT', (commitErr) => {
                                if (commitErr) {
                                    reject(commitErr);
                                } else {
                                    resolve(result);
                                }
                            });
                        } catch (operationErr) {
                            db.run('ROLLBACK', (rollbackErr) => {
                                if (rollbackErr) {
                                    logger.error('事务回滚失败:', rollbackErr);
                                }
                                reject(operationErr);
                            });
                        }
                    });
                });
            });
        },
        'dbExecuteInTransaction'
    );
}; 