const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'bot.db');
const db = new sqlite3.Database(dbPath);

console.log('开始修复数据库表结构...');

// 修复数据库表结构
const fixDatabase = async () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // 开始事务
            db.run('BEGIN TRANSACTION');

            // 创建所有必要的表
            const tables = [
                // 漂流瓶表
                `CREATE TABLE IF NOT EXISTS bottles (
                    id TEXT PRIMARY KEY,
                    sender_id INTEGER NOT NULL,
                    sender_username TEXT,
                    content TEXT NOT NULL,
                    media_type TEXT,
                    media_file_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    picked_at DATETIME,
                    picked_by INTEGER,
                    is_active BOOLEAN DEFAULT 1,
                    discard_count INTEGER DEFAULT 0
                )`,

                // 回复表
                `CREATE TABLE IF NOT EXISTS replies (
                    id TEXT PRIMARY KEY,
                    bottle_id TEXT NOT NULL,
                    sender_id INTEGER NOT NULL,
                    sender_username TEXT,
                    content TEXT NOT NULL,
                    media_type TEXT,
                    media_file_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (bottle_id) REFERENCES bottles (id)
                )`,

                // 用户统计表
                `CREATE TABLE IF NOT EXISTS user_stats (
                    user_id INTEGER PRIMARY KEY,
                    username TEXT,
                    bottles_thrown INTEGER DEFAULT 0,
                    bottles_picked INTEGER DEFAULT 0,
                    last_throw_time DATETIME,
                    last_pick_time DATETIME
                )`,

                // 用户积分表
                `CREATE TABLE IF NOT EXISTS user_points (
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
                )`,

                // 积分交易记录表
                `CREATE TABLE IF NOT EXISTS points_transactions (
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
                )`,

                // 积分商店商品表
                `CREATE TABLE IF NOT EXISTS points_shop_items (
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
                )`,

                // 用户购买记录表
                `CREATE TABLE IF NOT EXISTS user_purchases (
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
                )`,

                // 成就表
                `CREATE TABLE IF NOT EXISTS achievements (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    condition_type TEXT NOT NULL,
                    condition_value INTEGER NOT NULL,
                    reward_points INTEGER NOT NULL,
                    icon TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,

                // 用户成就记录表
                `CREATE TABLE IF NOT EXISTS user_achievements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    achievement_id TEXT NOT NULL,
                    achievement_name TEXT NOT NULL,
                    reward_points INTEGER NOT NULL DEFAULT 0,
                    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, achievement_id)
                )`,

                // 聊天会话表
                `CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    user1_id INTEGER NOT NULL,
                    user2_id INTEGER NOT NULL,
                    bottle_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at DATETIME,
                    FOREIGN KEY (bottle_id) REFERENCES bottles (id)
                )`,

                // 聊天消息表
                `CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    sender_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    media_type TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
                )`,

                // 好友关系表
                `CREATE TABLE IF NOT EXISTS friendships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user1_id INTEGER NOT NULL,
                    user2_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user1_id, user2_id),
                    CHECK(user1_id < user2_id)
                )`,

                // 好友申请表
                `CREATE TABLE IF NOT EXISTS friend_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_id INTEGER NOT NULL,
                    target_id INTEGER NOT NULL,
                    session_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
                    message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(requester_id, target_id, session_id)
                )`,

                // 用户信息表
                `CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id INTEGER PRIMARY KEY,
                    first_name TEXT,
                    last_name TEXT,
                    username TEXT,
                    language_code TEXT DEFAULT 'zh',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,

                // 群组和频道信息表
                `CREATE TABLE IF NOT EXISTS chat_groups (
                    chat_id INTEGER PRIMARY KEY,
                    chat_type TEXT NOT NULL CHECK (chat_type IN ('group', 'supergroup', 'channel')),
                    title TEXT,
                    username TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    bot_status TEXT DEFAULT 'member' CHECK (bot_status IN ('member', 'administrator', 'left', 'kicked')),
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_broadcast_at DATETIME,
                    broadcast_enabled BOOLEAN DEFAULT 1
                )`,

                // 广播消息模板表
                `CREATE TABLE IF NOT EXISTS broadcast_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    content TEXT NOT NULL,
                    media_type TEXT CHECK (media_type IN ('photo', 'voice', 'video', 'document')),
                    media_file_id TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,

                // 广播记录表
                `CREATE TABLE IF NOT EXISTS broadcast_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    template_id INTEGER,
                    chat_id INTEGER,
                    message_id INTEGER,
                    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'blocked')),
                    error_message TEXT,
                    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (template_id) REFERENCES broadcast_templates (id),
                    FOREIGN KEY (chat_id) REFERENCES chat_groups (chat_id)
                )`,

                // 广播计划表
                `CREATE TABLE IF NOT EXISTS broadcast_schedules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    template_id INTEGER NOT NULL,
                    cron_schedule TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    last_run_at DATETIME,
                    next_run_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (template_id) REFERENCES broadcast_templates (id)
                )`,

                // 广播消息表
                `CREATE TABLE IF NOT EXISTS broadcast_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    media_type TEXT,
                    media_file_id TEXT,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
                    target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'active', 'level')),
                    target_filter TEXT,
                    sent_count INTEGER DEFAULT 0,
                    total_count INTEGER DEFAULT 0,
                    error_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    started_at DATETIME,
                    completed_at DATETIME
                )`,

                // 广播接收记录表
                `CREATE TABLE IF NOT EXISTS broadcast_recipients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    broadcast_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
                    error_message TEXT,
                    sent_at DATETIME,
                    FOREIGN KEY (broadcast_id) REFERENCES broadcast_messages (id),
                    UNIQUE(broadcast_id, user_id)
                )`,

                // 瓶子丢弃记录表
                `CREATE TABLE IF NOT EXISTS bottle_discards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bottle_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    discarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(bottle_id, user_id),
                    FOREIGN KEY (bottle_id) REFERENCES bottles (id)
                )`
            ];

            // 创建索引
            const indexes = [
                `CREATE INDEX IF NOT EXISTS idx_bottles_active ON bottles (is_active, created_at)`,
                `CREATE INDEX IF NOT EXISTS idx_bottles_sender ON bottles (sender_id)`,
                `CREATE INDEX IF NOT EXISTS idx_replies_bottle ON replies (bottle_id)`,
                `CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON points_transactions (user_id, created_at)`,
                `CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON user_purchases (user_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_shop_items_category ON points_shop_items (category, is_active)`,
                `CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_chat_sessions_users ON chat_sessions (user1_id, user2_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id)`,
                `CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships (user1_id, user2_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_friend_requests_target ON friend_requests (target_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests (requester_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_friend_requests_session ON friend_requests (session_id)`,
                `CREATE INDEX IF NOT EXISTS idx_user_info_username ON user_profiles (username)`,
                `CREATE INDEX IF NOT EXISTS idx_user_info_display_name ON user_profiles (first_name, last_name)`,
                `CREATE INDEX IF NOT EXISTS idx_chat_groups_type ON chat_groups (chat_type, is_active)`,
                `CREATE INDEX IF NOT EXISTS idx_chat_groups_broadcast ON chat_groups (broadcast_enabled, is_active)`,
                `CREATE INDEX IF NOT EXISTS idx_broadcast_templates_active ON broadcast_templates (is_active)`,
                `CREATE INDEX IF NOT EXISTS idx_broadcast_logs_chat ON broadcast_logs (chat_id, sent_at)`,
                `CREATE INDEX IF NOT EXISTS idx_broadcast_logs_template ON broadcast_logs (template_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_broadcast_schedules_active ON broadcast_schedules (is_active, next_run_at)`,
                `CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages (status)`,
                `CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients (broadcast_id, status)`,
                `CREATE INDEX IF NOT EXISTS idx_bottle_discards_bottle ON bottle_discards (bottle_id)`
            ];

            let completed = 0;
            const total = tables.length + indexes.length;

            // 创建表
            tables.forEach((sql, index) => {
                db.run(sql, (err) => {
                    if (err) {
                        console.error(`创建表失败 (${index + 1}):`, err.message);
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    completed++;
                    if (completed === total) {
                        finishUp();
                    }
                });
            });

            // 创建索引
            indexes.forEach((sql, index) => {
                db.run(sql, (err) => {
                    if (err) {
                        console.error(`创建索引失败 (${index + 1}):`, err.message);
                        // 索引创建失败不回滚，继续执行
                    }
                    completed++;
                    if (completed === total) {
                        finishUp();
                    }
                });
            });

            function finishUp() {
                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('提交事务失败:', err.message);
                        reject(err);
                    } else {
                        console.log('✅ 数据库表结构修复完成');
                        resolve();
                    }
                });
            }
        });
    });
};

// 执行修复
fixDatabase()
    .then(() => {
        console.log('🎉 数据库修复成功完成');
        db.close((err) => {
            if (err) {
                console.error('关闭数据库失败:', err.message);
            } else {
                console.log('数据库连接已关闭');
            }
            process.exit(0);
        });
    })
    .catch((error) => {
        console.error('❌ 数据库修复失败:', error);
        db.close();
        process.exit(1);
    }); 