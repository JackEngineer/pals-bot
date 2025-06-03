const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/bot.db');

console.log('🔄 开始迁移用户统计数据...');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接失败:', err);
        process.exit(1);
    }
    console.log('✅ 数据库连接成功');
});

db.serialize(() => {
    console.log('📊 检查和更新user_stats表结构...');
    
    // 添加bottles_replied字段（如果不存在）
    db.run(`ALTER TABLE user_stats ADD COLUMN bottles_replied INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ 添加bottles_replied字段失败:', err);
        } else {
            console.log('✅ bottles_replied字段已存在或添加成功');
        }
    });
    
    // 添加last_reply_time字段（如果不存在）
    db.run(`ALTER TABLE user_stats ADD COLUMN last_reply_time DATETIME`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('❌ 添加last_reply_time字段失败:', err);
        } else {
            console.log('✅ last_reply_time字段已存在或添加成功');
        }
        
        // 更新现有用户的回复统计
        console.log('📈 更新现有用户的回复统计数据...');
        db.run(`
            UPDATE user_stats 
            SET bottles_replied = (
                SELECT COUNT(*) 
                FROM replies 
                WHERE replies.sender_id = user_stats.user_id
            )
            WHERE user_id IN (SELECT DISTINCT sender_id FROM replies)
        `, (err) => {
            if (err) {
                console.error('❌ 更新回复统计失败:', err);
            } else {
                console.log('✅ 回复统计更新成功');
                
                // 查看更新结果
                db.all(`
                    SELECT user_id, bottles_thrown, bottles_picked, bottles_replied 
                    FROM user_stats 
                    WHERE bottles_replied > 0 
                    ORDER BY bottles_replied DESC 
                    LIMIT 10
                `, (err, rows) => {
                    if (err) {
                        console.error('❌ 查询统计数据失败:', err);
                    } else {
                        console.log('📊 回复统计排行榜（前10名）:');
                        console.table(rows);
                    }
                    
                    db.close((err) => {
                        if (err) {
                            console.error('❌ 关闭数据库失败:', err);
                        } else {
                            console.log('✅ 迁移完成，数据库已关闭');
                        }
                        process.exit(0);
                    });
                });
            }
        });
    });
}); 