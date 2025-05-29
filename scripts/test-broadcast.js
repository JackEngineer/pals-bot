#!/usr/bin/env node

/**
 * 广播功能测试脚本
 * 用于验证广播服务的基本功能
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 数据库路径
const dbPath = process.env.DATABASE_PATH || './data/bot.db';

console.log('🧪 开始测试广播功能...\n');

// 测试数据库连接和表结构
function testDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ 数据库连接失败:', err.message);
                reject(err);
                return;
            }
            
            console.log('✅ 数据库连接成功');
            
            // 检查广播相关表是否存在
            const tables = [
                'chat_groups',
                'broadcast_templates', 
                'broadcast_logs',
                'broadcast_schedules'
            ];
            
            let checkedTables = 0;
            
            tables.forEach(tableName => {
                db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [tableName],
                    (err, row) => {
                        if (err) {
                            console.error(`❌ 检查表 ${tableName} 失败:`, err.message);
                        } else if (row) {
                            console.log(`✅ 表 ${tableName} 存在`);
                        } else {
                            console.log(`❌ 表 ${tableName} 不存在`);
                        }
                        
                        checkedTables++;
                        if (checkedTables === tables.length) {
                            db.close();
                            resolve();
                        }
                    }
                );
            });
        });
    });
}

// 测试广播模板
function testBroadcastTemplates() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            db.all(
                "SELECT * FROM broadcast_templates WHERE is_active = 1",
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ 查询广播模板失败:', err.message);
                        reject(err);
                    } else {
                        console.log(`\n📋 找到 ${rows.length} 个活跃的广播模板:`);
                        rows.forEach(template => {
                            console.log(`  🆔 ID: ${template.id}`);
                            console.log(`  📝 名称: ${template.name}`);
                            console.log(`  📄 内容长度: ${template.content.length} 字符`);
                            console.log(`  📅 创建时间: ${template.created_at}\n`);
                        });
                        resolve(rows);
                    }
                    db.close();
                }
            );
        });
    });
}

// 测试群组表
function testChatGroups() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            db.all(
                "SELECT * FROM chat_groups WHERE is_active = 1",
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ 查询群组失败:', err.message);
                        reject(err);
                    } else {
                        console.log(`👥 找到 ${rows.length} 个活跃群组:`);
                        if (rows.length === 0) {
                            console.log('  (暂无群组，机器人需要先被添加到群组中)');
                        } else {
                            rows.forEach(group => {
                                console.log(`  🆔 ID: ${group.chat_id}`);
                                console.log(`  📝 名称: ${group.title || '未知'}`);
                                console.log(`  📊 类型: ${group.chat_type}`);
                                console.log(`  📢 广播启用: ${group.broadcast_enabled ? '是' : '否'}`);
                                console.log(`  📅 最后活跃: ${group.last_activity_at}\n`);
                            });
                        }
                        resolve(rows);
                    }
                    db.close();
                }
            );
        });
    });
}

// 测试广播日志
function testBroadcastLogs() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            db.all(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                    COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked
                FROM broadcast_logs`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ 查询广播日志失败:', err.message);
                        reject(err);
                    } else {
                        const stats = rows[0];
                        console.log(`📊 广播统计:`);
                        console.log(`  📤 总发送: ${stats.total}`);
                        console.log(`  ✅ 成功: ${stats.sent}`);
                        console.log(`  ❌ 失败: ${stats.failed}`);
                        console.log(`  🚫 被阻止: ${stats.blocked}`);
                        
                        const successRate = stats.total > 0 ? 
                            Math.round((stats.sent / stats.total) * 100) : 0;
                        console.log(`  📈 成功率: ${successRate}%\n`);
                        
                        resolve(stats);
                    }
                    db.close();
                }
            );
        });
    });
}

// 主测试函数
async function runTests() {
    try {
        console.log('1️⃣ 测试数据库连接和表结构...');
        await testDatabase();
        
        console.log('\n2️⃣ 测试广播模板...');
        await testBroadcastTemplates();
        
        console.log('3️⃣ 测试群组数据...');
        await testChatGroups();
        
        console.log('4️⃣ 测试广播统计...');
        await testBroadcastLogs();
        
        console.log('🎉 所有测试完成！');
        console.log('\n📝 使用说明:');
        console.log('1. 将机器人添加到群组中以开始收集群组数据');
        console.log('2. 在 .env 文件中设置 ADMIN_USER_IDS');
        console.log('3. 使用 /admin_broadcast 命令管理广播');
        console.log('4. 群组管理员可使用 /broadcast_on 和 /broadcast_off 控制广播');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        process.exit(1);
    }
}

// 运行测试
runTests(); 