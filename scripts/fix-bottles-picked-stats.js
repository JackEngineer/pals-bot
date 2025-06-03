const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/bot.db');

console.log('🔄 修复bottles_picked统计数据...');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ 数据库连接失败:', err);
        process.exit(1);
    }
    console.log('✅ 数据库连接成功');
});

db.serialize(() => {
    console.log('📊 开始修复bottles_picked统计...');
    
    // 重新计算所有用户的正确捡拾统计
    console.log('📈 重新计算用户捡拾统计...');
    db.run(`
        UPDATE user_stats 
        SET bottles_picked = (
            SELECT COUNT(*) 
            FROM bottles 
            WHERE bottles.picked_by = user_stats.user_id
        )
        WHERE user_id IN (
            SELECT DISTINCT picked_by 
            FROM bottles 
            WHERE picked_by IS NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error('❌ 更新捡拾统计失败:', err);
        } else {
            console.log('✅ 捡拾统计修复成功');
            
            // 显示修复结果统计
            db.all(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(bottles_picked) as total_picked,
                    AVG(bottles_picked) as avg_picked,
                    MAX(bottles_picked) as max_picked
                FROM user_stats 
                WHERE bottles_picked > 0
            `, (err, rows) => {
                if (err) {
                    console.error('❌ 查询统计数据失败:', err);
                } else {
                    console.log('📊 修复结果统计:');
                    console.table(rows);
                }
                
                // 显示前10名用户
                db.all(`
                    SELECT user_id, bottles_thrown, bottles_picked, bottles_replied,
                           (SELECT COUNT(*) FROM bottle_discards WHERE bottle_discards.user_id = user_stats.user_id) as discarded
                    FROM user_stats 
                    WHERE bottles_picked > 0 
                    ORDER BY bottles_picked DESC 
                    LIMIT 10
                `, (err, rows) => {
                    if (err) {
                        console.error('❌ 查询排行榜失败:', err);
                    } else {
                        console.log('🏆 捡拾统计排行榜（前10名）:');
                        console.table(rows);
                    }
                    
                    db.close((err) => {
                        if (err) {
                            console.error('❌ 关闭数据库失败:', err);
                        } else {
                            console.log('✅ 修复完成，数据库已关闭');
                            console.log('');
                            console.log('💡 修复说明:');
                            console.log('   - bottles_picked 现在记录总捡拾次数（不受丢弃影响）');
                            console.log('   - 这更好地反映了用户的活跃度和参与度');
                            console.log('   - 丢弃瓶子不会减少用户的成就统计');
                        }
                        process.exit(0);
                    });
                });
            });
        }
    });
}); 