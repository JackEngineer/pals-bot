#!/usr/bin/env node

/**
 * 群组状态详细检查脚本
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 数据库路径
const dbPath = process.env.DATABASE_PATH || './data/bot.db';

console.log('🔍 详细检查群组状态...\n');

function checkGroupStatus() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ 数据库连接失败:', err.message);
                reject(err);
                return;
            }
            
            // 查询所有群组（包括非活跃的）
            db.all(
                `SELECT 
                    chat_id,
                    chat_type,
                    title,
                    username,
                    is_active,
                    bot_status,
                    broadcast_enabled,
                    added_at,
                    last_activity_at,
                    last_broadcast_at
                FROM chat_groups 
                ORDER BY last_activity_at DESC`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('❌ 查询群组失败:', err.message);
                        reject(err);
                    } else {
                        console.log(`📊 总共找到 ${rows.length} 个群组记录:\n`);
                        
                        if (rows.length === 0) {
                            console.log('❌ 没有找到任何群组记录');
                            console.log('\n🔧 可能的原因:');
                            console.log('1. 机器人还未被添加到任何群组');
                            console.log('2. 机器人被添加后没有接收到群组事件');
                            console.log('3. 群组事件处理器有问题');
                            console.log('\n💡 解决方法:');
                            console.log('1. 确保机器人正在运行');
                            console.log('2. 将机器人添加到群组');
                            console.log('3. 在群组中发送任意消息（触发群组注册）');
                            console.log('4. 检查机器人日志');
                        } else {
                            rows.forEach((group, index) => {
                                console.log(`📋 群组 ${index + 1}:`);
                                console.log(`  🆔 ID: ${group.chat_id}`);
                                console.log(`  📝 名称: ${group.title || '未知'}`);
                                console.log(`  📊 类型: ${group.chat_type}`);
                                console.log(`  🟢 活跃状态: ${group.is_active ? '是' : '否'}`);
                                console.log(`  🤖 机器人状态: ${group.bot_status}`);
                                console.log(`  📢 广播启用: ${group.broadcast_enabled ? '是' : '否'}`);
                                console.log(`  📅 添加时间: ${group.added_at}`);
                                console.log(`  ⏰ 最后活跃: ${group.last_activity_at}`);
                                console.log(`  📤 最后广播: ${group.last_broadcast_at || '从未'}`);
                                
                                // 状态分析
                                if (!group.is_active) {
                                    console.log(`  ⚠️  状态: 非活跃群组`);
                                } else if (!group.broadcast_enabled) {
                                    console.log(`  ⚠️  状态: 广播已关闭`);
                                } else if (group.bot_status !== 'member' && group.bot_status !== 'administrator') {
                                    console.log(`  ⚠️  状态: 机器人不在群组中`);
                                } else {
                                    console.log(`  ✅ 状态: 可接收广播`);
                                }
                                console.log('');
                            });
                            
                            // 统计信息
                            const activeGroups = rows.filter(g => g.is_active);
                            const broadcastEnabledGroups = rows.filter(g => g.is_active && g.broadcast_enabled);
                            const availableForBroadcast = rows.filter(g => 
                                g.is_active && 
                                g.broadcast_enabled && 
                                (g.bot_status === 'member' || g.bot_status === 'administrator')
                            );
                            
                            console.log('📈 统计汇总:');
                            console.log(`  📊 总群组数: ${rows.length}`);
                            console.log(`  🟢 活跃群组: ${activeGroups.length}`);
                            console.log(`  📢 启用广播: ${broadcastEnabledGroups.length}`);
                            console.log(`  ✅ 可接收广播: ${availableForBroadcast.length}`);
                        }
                        
                        resolve(rows);
                    }
                    db.close();
                }
            );
        });
    });
}

// 运行检查
checkGroupStatus().catch(error => {
    console.error('检查失败:', error.message);
    process.exit(1);
}); 