import { dbGet, dbAll, dbRun, dbExecuteInTransaction, Bottle, Reply, UserStats } from './database';
import { v4 as uuidv4 } from 'uuid';
import { PointsService } from './points-service';
import { logger } from '../utils/logger';

export class BottleService {
    // 投放漂流瓶
    static async throwBottle(data: {
        senderId: number;
        senderUsername?: string;
        content: string;
        mediaType?: 'photo' | 'voice' | 'video' | 'document';
        mediaFileId?: string;
    }): Promise<string> {
        try {
            // 检查今日投放次数限制
            let maxBottlesPerDay = parseInt(process.env.MAX_BOTTLES_PER_DAY || '5');
            
            // 检查是否有额外投放次数特权
            const hasExtraThrows = await PointsService.checkUserPurchase(data.senderId, 'extra_throws_5');
            if (hasExtraThrows) {
                maxBottlesPerDay += 5;
            }

            const todayCount = await this.getUserTodayBottleCount(data.senderId);
            
            if (todayCount >= maxBottlesPerDay) {
                throw new Error(`今日投放次数已达上限 (${maxBottlesPerDay} 个)`);
            }

            // 检查内容长度
            const maxLength = parseInt(process.env.MAX_BOTTLE_CONTENT_LENGTH || '1000');
            if (data.content.length > maxLength) {
                throw new Error(`漂流瓶内容过长，最多 ${maxLength} 个字符`);
            }

            const bottleId = uuidv4();
            
            await dbRun(`
                INSERT INTO bottles (id, sender_id, sender_username, content, media_type, media_file_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [bottleId, data.senderId, data.senderUsername, data.content, data.mediaType, data.mediaFileId]);

            // 更新用户统计
            await this.updateUserStats(data.senderId, 'throw', data.senderUsername);

            // 添加积分奖励
            await PointsService.addPoints(
                data.senderId,
                10, // THROW_BOTTLE points
                'throw_bottle',
                '投放漂流瓶',
                bottleId,
                data.senderUsername
            );

            logger.info(`用户 ${data.senderId} 投放漂流瓶: ${bottleId}`);
            return bottleId;
        } catch (error) {
            logger.error('投放漂流瓶失败:', error);
            throw error;
        }
    }

    // 随机捡拾漂流瓶
    static async pickBottle(userId: number): Promise<Bottle | null> {
        try {
            // 首先在事务外检查特权状态
            const hasReplyPriority = await PointsService.checkUserPurchase(userId, 'reply_priority_24h');
            
            // 在事务中执行核心数据库操作
            const result = await dbExecuteInTransaction(async () => {
                // 查找可用的漂流瓶（排除自己投放的）
                let sql = `
                    SELECT * FROM bottles 
                    WHERE is_active = 1 AND sender_id != ?
                    ORDER BY RANDOM() 
                    LIMIT 1
                `;
                
                if (hasReplyPriority) {
                    // 优先显示回复较少的瓶子
                    sql = `
                        SELECT b.* FROM bottles b
                        LEFT JOIN (
                            SELECT bottle_id, COUNT(*) as reply_count 
                            FROM replies 
                            GROUP BY bottle_id
                        ) r ON b.id = r.bottle_id
                        WHERE b.is_active = 1 AND b.sender_id != ?
                        ORDER BY COALESCE(r.reply_count, 0) ASC, RANDOM()
                        LIMIT 1
                    `;
                }

                const bottle = await dbGet(sql, [userId]) as Bottle;

                if (!bottle) {
                    return null;
                }

                // 检查瓶子是否仍然可用（避免并发问题）
                const updateResult = await dbRun(`
                    UPDATE bottles 
                    SET picked_at = CURRENT_TIMESTAMP, picked_by = ?, is_active = 0
                    WHERE id = ? AND is_active = 1
                `, [userId, bottle.id]);

                // 如果没有更新任何行，说明瓶子已被其他人捡拾
                if (updateResult.changes === 0) {
                    return null;
                }

                // 更新用户统计
                await this.updateUserStatsInTransaction(userId, 'pick', undefined);

                return bottle;
            });

            if (!result) {
                return null;
            }

            // 在事务外添加积分奖励
            try {
                await PointsService.addPoints(
                    userId,
                    5, // PICK_BOTTLE points
                    'pick_bottle',
                    '捡拾漂流瓶',
                    result.id
                );
            } catch (pointsError) {
                logger.warn('添加捡拾积分失败，但捡拾成功:', pointsError);
            }

            logger.info(`用户 ${userId} 捡拾漂流瓶: ${result.id}`);
            return { ...result, picked_by: userId, picked_at: new Date().toISOString(), is_active: false };
        } catch (error) {
            logger.error('捡拾漂流瓶失败:', error);
            throw error;
        }
    }

    // 回复漂流瓶
    static async replyToBottle(data: {
        bottleId: string;
        senderId: number;
        senderUsername?: string;
        content: string;
        mediaType?: 'photo' | 'voice' | 'video' | 'document';
        mediaFileId?: string;
    }): Promise<string> {
        try {
            const replyId = uuidv4();
            
            await dbRun(`
                INSERT INTO replies (id, bottle_id, sender_id, sender_username, content, media_type, media_file_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [replyId, data.bottleId, data.senderId, data.senderUsername, data.content, data.mediaType, data.mediaFileId]);

            // 添加回复者积分
            await PointsService.addPoints(
                data.senderId,
                8, // REPLY_BOTTLE points
                'reply_bottle',
                '回复漂流瓶',
                replyId,
                data.senderUsername
            );

            // 获取原瓶子信息，给原作者积分
            const bottle = await dbGet(`SELECT * FROM bottles WHERE id = ?`, [data.bottleId]) as Bottle | null;
            if (bottle) {
                await PointsService.addPoints(
                    bottle.sender_id,
                    3, // RECEIVE_REPLY points
                    'receive_reply',
                    '收到漂流瓶回复',
                    replyId
                );

                // 检查是否达到人气瓶子成就（10个回复）
                const replyCount = await dbGet(`
                    SELECT COUNT(*) as count FROM replies WHERE bottle_id = ?
                `, [data.bottleId]) as { count: number };

                if (replyCount.count === 10) {
                    await PointsService.addPoints(
                        bottle.sender_id,
                        50,
                        'popular_bottle',
                        '人气瓶子奖励（10个回复）',
                        data.bottleId
                    );
                }
            }

            logger.info(`用户 ${data.senderId} 回复漂流瓶: ${data.bottleId}`);
            return replyId;
        } catch (error) {
            logger.error('回复漂流瓶失败:', error);
            throw error;
        }
    }

    // 获取用户投放的漂流瓶
    static async getUserBottles(userId: number, limit: number = 10): Promise<Bottle[]> {
        return await dbAll(`
            SELECT * FROM bottles 
            WHERE sender_id = ?
            ORDER BY created_at DESC 
            LIMIT ?
        `, [userId, limit]) as Bottle[];
    }

    // 获取用户捡到的漂流瓶
    static async getPickedBottles(userId: number, limit: number = 10): Promise<Bottle[]> {
        return await dbAll(`
            SELECT * FROM bottles 
            WHERE picked_by = ?
            ORDER BY picked_at DESC 
            LIMIT ?
        `, [userId, limit]) as Bottle[];
    }

    // 获取漂流瓶的回复
    static async getBottleReplies(bottleId: string): Promise<Reply[]> {
        return await dbAll(`
            SELECT * FROM replies 
            WHERE bottle_id = ?
            ORDER BY created_at ASC
        `, [bottleId]) as Reply[];
    }

    // 获取用户统计（增强版，包含积分信息）
    static async getUserStats(userId: number) {
        const [stats, thrownBottles, pickedBottles, userPoints, achievements] = await Promise.all([
            dbGet(`SELECT * FROM user_stats WHERE user_id = ?`, [userId]) as Promise<UserStats | null>,
            this.getUserBottles(userId, 5),
            this.getPickedBottles(userId, 5),
            PointsService.getUserPoints(userId),
            PointsService.getUserAchievements(userId)
        ]);

        return {
            stats: stats || {
                user_id: userId,
                bottles_thrown: 0,
                bottles_picked: 0
            },
            recentThrown: thrownBottles,
            recentPicked: pickedBottles,
            points: userPoints,
            achievements: achievements.slice(0, 3) // 最近3个成就
        };
    }

    // 获取全局统计（增强版）
    static async getGlobalStats() {
        const [bottles, activeBottles, replies, users, totalPoints, topUser] = await Promise.all([
            dbGet(`SELECT COUNT(*) as count FROM bottles`) as Promise<{ count: number }>,
            dbGet(`SELECT COUNT(*) as count FROM bottles WHERE is_active = 1`) as Promise<{ count: number }>,
            dbGet(`SELECT COUNT(*) as count FROM replies`) as Promise<{ count: number }>,
            dbGet(`SELECT COUNT(*) as count FROM user_stats`) as Promise<{ count: number }>,
            dbGet(`SELECT SUM(total_points) as total FROM user_points`) as Promise<{ total: number }>,
            dbGet(`
                SELECT username, total_points, level_name 
                FROM user_points 
                ORDER BY total_points DESC 
                LIMIT 1
            `) as Promise<{ username: string; total_points: number; level_name: string } | null>
        ]);

        return {
            totalBottles: bottles.count,
            activeBottles: activeBottles.count,
            totalReplies: replies.count,
            totalUsers: users.count,
            totalPoints: totalPoints.total || 0,
            topUser: topUser ? {
                username: topUser.username || '匿名用户',
                points: topUser.total_points,
                level: topUser.level_name
            } : null
        };
    }

    // 检查用户今日投放次数
    static async getUserTodayBottleCount(userId: number): Promise<number> {
        const result = await dbGet(`
            SELECT COUNT(*) as count FROM bottles 
            WHERE sender_id = ? AND DATE(created_at) = DATE('now')
        `, [userId]) as { count: number };
        
        return result.count;
    }

    // 更新用户统计
    private static async updateUserStats(userId: number, action: 'throw' | 'pick', username?: string): Promise<void> {
        const field = action === 'throw' ? 'bottles_thrown' : 'bottles_picked';
        const timeField = action === 'throw' ? 'last_throw_time' : 'last_pick_time';
        
        await dbRun(`
            INSERT OR REPLACE INTO user_stats (user_id, username, ${field}, ${timeField})
            VALUES (
                ?, 
                COALESCE(?, (SELECT username FROM user_stats WHERE user_id = ?)),
                COALESCE((SELECT ${field} FROM user_stats WHERE user_id = ?), 0) + 1,
                CURRENT_TIMESTAMP
            )
        `, [userId, username, userId, userId]);
    }

    // 更新用户统计（事务内版本）
    private static async updateUserStatsInTransaction(userId: number, action: 'throw' | 'pick', username?: string): Promise<void> {
        const field = action === 'throw' ? 'bottles_thrown' : 'bottles_picked';
        const timeField = action === 'throw' ? 'last_throw_time' : 'last_pick_time';
        
        await dbRun(`
            INSERT OR REPLACE INTO user_stats (user_id, username, ${field}, ${timeField})
            VALUES (
                ?, 
                COALESCE(?, (SELECT username FROM user_stats WHERE user_id = ?)),
                COALESCE((SELECT ${field} FROM user_stats WHERE user_id = ?), 0) + 1,
                CURRENT_TIMESTAMP
            )
        `, [userId, username, userId, userId]);
    }

    // 获取用户特权状态
    static async getUserPrivileges(userId: number): Promise<{
        isVip: boolean;
        hasExtraThrows: boolean;
        hasSelectivePick: boolean;
        hasAnonymousMode: boolean;
        hasCustomSignature: boolean;
        hasColorfulMessage: boolean;
        hasDoublePoints: boolean;
        hasLuckyBoost: boolean;
        hasReplyPriority: boolean;
    }> {
        const [
            isVip,
            hasExtraThrows,
            hasSelectivePick,
            hasAnonymousMode,
            hasCustomSignature,
            hasColorfulMessage,
            hasDoublePoints,
            hasLuckyBoost,
            hasReplyPriority
        ] = await Promise.all([
            PointsService.checkVipStatus(userId),
            PointsService.checkUserPurchase(userId, 'extra_throws_5'),
            PointsService.checkUserPurchase(userId, 'selective_pick'),
            PointsService.checkUserPurchase(userId, 'anonymous_mode'),
            PointsService.checkUserPurchase(userId, 'custom_signature'),
            PointsService.checkUserPurchase(userId, 'colorful_message'),
            PointsService.checkUserPurchase(userId, 'double_points_24h'),
            PointsService.checkUserPurchase(userId, 'lucky_boost_24h'),
            PointsService.checkUserPurchase(userId, 'reply_priority_24h')
        ]);

        return {
            isVip,
            hasExtraThrows,
            hasSelectivePick,
            hasAnonymousMode,
            hasCustomSignature,
            hasColorfulMessage,
            hasDoublePoints,
            hasLuckyBoost,
            hasReplyPriority
        };
    }

    // 撤回漂流瓶（新功能）
    static async recallBottle(userId: number, bottleId: string): Promise<boolean> {
        try {
            // 检查是否有撤回权限
            const hasRecallRight = await PointsService.checkUserPurchase(userId, 'message_recall');
            if (!hasRecallRight) {
                throw new Error('需要购买消息撤回特权');
            }

            // 检查瓶子是否属于用户且在24小时内
            const bottle = await dbGet(`
                SELECT * FROM bottles 
                WHERE id = ? AND sender_id = ? 
                AND created_at > datetime('now', '-24 hours')
            `, [bottleId, userId]) as Bottle | null;

            if (!bottle) {
                throw new Error('无法撤回此漂流瓶（不存在、不属于你或已超过24小时）');
            }

            if (bottle.picked_by) {
                throw new Error('漂流瓶已被捡拾，无法撤回');
            }

            // 删除漂流瓶
            await dbRun(`DELETE FROM bottles WHERE id = ?`, [bottleId]);

            // 标记撤回特权为已使用
            await dbRun(`
                UPDATE user_purchases 
                SET status = 'used', updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND item_id = 'message_recall' AND status = 'active'
                LIMIT 1
            `, [userId]);

            logger.info(`用户 ${userId} 撤回漂流瓶: ${bottleId}`);
            return true;
        } catch (error) {
            logger.error('撤回漂流瓶失败:', error);
            throw error;
        }
    }
} 