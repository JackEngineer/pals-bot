import { dbGet, dbAll, dbRun, dbExecuteInTransaction, Bottle, Reply, UserStats } from './database';
import { v4 as uuidv4 } from 'uuid';
import { PointsService } from './points-service';
import { NotificationService } from './notification-service';
import { logger } from '../utils/logger';

// 生成中国时区的时间戳字符串
const getCurrentTimestamp = (): string => {
    return new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\//g, '-');
};

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
            const currentTime = getCurrentTimestamp();
            
            await dbRun(`
                INSERT INTO bottles (id, sender_id, sender_username, content, media_type, media_file_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [bottleId, data.senderId, data.senderUsername, data.content, data.mediaType, data.mediaFileId, currentTime]);

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
            // 🆕 首先检查是否能成功捡到瓶子（概率检查）
            const canPickBottle = await this.checkPickBottleProbability(userId);
            if (!canPickBottle) {
                // 捡瓶子失败，但仍然给少量积分作为安慰奖
                await PointsService.addPoints(
                    userId,
                    1, // 安慰奖积分
                    'pick_attempt',
                    '尝试捡拾漂流瓶'
                );
                return null;
            }

            // 在事务中执行核心数据库操作
            const result = await dbExecuteInTransaction(async () => {
                // 查找可用的漂流瓶（排除自己投放的和自己已丢弃的）
                let sql = `
                    SELECT b.*, COALESCE(b.discard_count, 0) as discard_count
                    FROM bottles b
                    WHERE b.is_active = 1 
                    AND b.sender_id != ?
                    AND b.id NOT IN (
                        SELECT bottle_id FROM bottle_discards WHERE user_id = ?
                    )
                    ORDER BY RANDOM() 
                    LIMIT 10
                `;
                
                // 在事务内检查特权状态（不涉及其他事务）
                const hasReplyPriority = await dbGet(`
                    SELECT * FROM user_purchases 
                    WHERE user_id = ? AND item_id = 'reply_priority_24h' AND status = 'active'
                    AND (expires_at IS NULL OR expires_at > ?)
                `, [userId, getCurrentTimestamp()]);
                
                if (hasReplyPriority) {
                    // 优先显示回复较少的瓶子
                    sql = `
                        SELECT b.*, COALESCE(b.discard_count, 0) as discard_count
                        FROM bottles b
                        LEFT JOIN (
                            SELECT bottle_id, COUNT(*) as reply_count 
                            FROM replies 
                            GROUP BY bottle_id
                        ) r ON b.id = r.bottle_id
                        WHERE b.is_active = 1 
                        AND b.sender_id != ?
                        AND b.id NOT IN (
                            SELECT bottle_id FROM bottle_discards WHERE user_id = ?
                        )
                        ORDER BY COALESCE(r.reply_count, 0) ASC, RANDOM()
                        LIMIT 10
                    `;
                }

                const bottles = await dbAll(sql, [userId, userId]) as Bottle[];

                if (!bottles || bottles.length === 0) {
                    return null;
                }

                // 🆕 基于丢弃次数计算概率并选择瓶子
                const selectedBottle = this.selectBottleByDiscardProbability(bottles);

                if (!selectedBottle) {
                    return null;
                }

                const currentTime = getCurrentTimestamp();

                // 检查瓶子是否仍然可用（避免并发问题）
                const updateResult = await dbRun(`
                    UPDATE bottles 
                    SET picked_at = ?, picked_by = ?, is_active = 0
                    WHERE id = ? AND is_active = 1
                `, [currentTime, userId, selectedBottle.id]);

                // 如果没有更新任何行，说明瓶子已被其他人捡拾
                if (updateResult.changes === 0) {
                    return null;
                }

                // 更新用户统计
                await this.updateUserStatsInTransaction(userId, 'pick', undefined);

                return selectedBottle;
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
            // 使用与数据库一致的时间格式
            const pickedTime = getCurrentTimestamp();
            return { ...result, picked_by: userId, picked_at: pickedTime, is_active: false };
        } catch (error) {
            logger.error('捡拾漂流瓶失败:', error);
            throw error;
        }
    }

    // 🆕 检查捡瓶子成功概率（基于用户等级）
    private static async checkPickBottleProbability(userId: number): Promise<boolean> {
        try {
            // 获取用户积分和等级信息
            const userPoints = await PointsService.getUserPoints(userId);
            const userLevel = userPoints.level;

            // 基础概率配置（基于等级）
            const baseProbabilityConfig = {
                1: 0.60, // 新手水手 - 60%
                2: 0.70, // 见习船员 - 70%
                3: 0.78, // 资深航海者 - 78%
                4: 0.85, // 海洋探索家 - 85%
                5: 0.90  // 漂流瓶大师 - 90%
            };

            let successProbability = baseProbabilityConfig[userLevel as keyof typeof baseProbabilityConfig] || 0.60;

            // 🍀 检查幸运加成特权
            const hasLuckyBoost = await PointsService.checkUserPurchase(userId, 'lucky_boost_24h');
            if (hasLuckyBoost) {
                successProbability += 0.10; // 幸运加成增加10%概率
                successProbability = Math.min(successProbability, 0.95); // 最高不超过95%
            }

            // 🎯 VIP会员小幅概率加成
            const isVip = await PointsService.checkVipStatus(userId);
            if (isVip) {
                successProbability += 0.03; // VIP增加3%概率
                successProbability = Math.min(successProbability, 0.95); // 最高不超过95%
            }

            // 生成随机数并判断是否成功
            const random = Math.random();
            const success = random <= successProbability;

            // 记录捡拾尝试日志（用于数据分析）
            logger.info(`捡瓶子概率检查 - 用户: ${userId}, 等级: Lv.${userLevel}, 概率: ${(successProbability * 100).toFixed(1)}%, 随机数: ${random.toFixed(3)}, 结果: ${success ? '成功' : '失败'}`);

            return success;
        } catch (error) {
            logger.error('检查捡瓶子概率失败:', error);
            // 出错时返回最低概率
            return Math.random() <= 0.50;
        }
    }

    // 🆕 基于丢弃次数的概率选择算法
    private static selectBottleByDiscardProbability(bottles: Bottle[]): Bottle | null {
        if (!bottles || bottles.length === 0) {
            return null;
        }

        // 为每个瓶子计算被选中的权重（丢弃次数越多，权重越低）
        const bottlesWithWeight = bottles.map(bottle => {
            const discardCount = bottle.discard_count || 0;
            // 权重计算：基础权重100，每被丢弃一次权重减少20，最低权重为10
            const weight = Math.max(100 - (discardCount * 20), 10);
            return { bottle, weight };
        });

        // 计算总权重
        const totalWeight = bottlesWithWeight.reduce((sum, item) => sum + item.weight, 0);

        // 记录选择过程（调试用）
        logger.info(`瓶子选择概率分布:`, {
            total_bottles: bottles.length,
            total_weight: totalWeight,
            bottles: bottlesWithWeight.map(item => ({
                id: item.bottle.id.slice(-8),
                discard_count: item.bottle.discard_count || 0,
                weight: item.weight,
                probability: `${((item.weight / totalWeight) * 100).toFixed(1)}%`
            }))
        });

        // 随机选择
        const random = Math.random() * totalWeight;
        let currentWeight = 0;

        for (const item of bottlesWithWeight) {
            currentWeight += item.weight;
            if (random <= currentWeight) {
                logger.info(`选中瓶子: ${item.bottle.id.slice(-8)}, 丢弃次数: ${item.bottle.discard_count || 0}, 权重: ${item.weight}`);
                return item.bottle;
            }
        }

        // 如果没有选中任何瓶子，返回第一个
        const fallbackBottle = bottlesWithWeight[0].bottle;
        logger.info(`降级选择瓶子: ${fallbackBottle.id.slice(-8)}`);
        return fallbackBottle;
    }

    // 🆕 丢弃漂流瓶
    static async discardBottle(userId: number, bottleId: string): Promise<boolean> {
        try {
            return await dbExecuteInTransaction(async () => {
                // 检查瓶子是否存在且已被用户捡拾
                const bottle = await dbGet(`
                    SELECT * FROM bottles 
                    WHERE id = ? AND picked_by = ? AND is_active = 0
                `, [bottleId, userId]) as Bottle | null;

                if (!bottle) {
                    throw new Error('瓶子不存在或未被你捡拾');
                }

                // 检查用户是否已经丢弃过这个瓶子
                const existingDiscard = await dbGet(`
                    SELECT * FROM bottle_discards 
                    WHERE bottle_id = ? AND user_id = ?
                `, [bottleId, userId]);

                if (existingDiscard) {
                    throw new Error('你已经丢弃过这个瓶子');
                }

                // 记录丢弃
                await dbRun(`
                    INSERT INTO bottle_discards (bottle_id, user_id, discarded_at)
                    VALUES (?, ?, ?)
                `, [bottleId, userId, getCurrentTimestamp()]);

                // 增加瓶子的丢弃计数并重新激活
                await dbRun(`
                    UPDATE bottles 
                    SET discard_count = COALESCE(discard_count, 0) + 1,
                        is_active = 1,
                        picked_at = NULL,
                        picked_by = NULL
                    WHERE id = ?
                `, [bottleId]);

                return true;
            });
        } catch (error) {
            logger.error('丢弃漂流瓶失败:', error);
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
            const currentTime = getCurrentTimestamp();
            
            await dbRun(`
                INSERT INTO replies (id, bottle_id, sender_id, sender_username, content, media_type, media_file_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [replyId, data.bottleId, data.senderId, data.senderUsername, data.content, data.mediaType, data.mediaFileId, currentTime]);

            // 更新用户统计 - 新增回复统计逻辑
            await this.updateUserStatsForReply(data.senderId, data.senderUsername);

            // 添加回复者积分
            await PointsService.addPoints(
                data.senderId,
                8, // REPLY_BOTTLE points
                'reply_bottle',
                '回复漂流瓶',
                replyId,
                data.senderUsername
            );

            // 获取原瓶子信息，给原作者积分并发送通知
            const bottle = await dbGet(`SELECT * FROM bottles WHERE id = ?`, [data.bottleId]) as Bottle | null;
            if (bottle) {
                await PointsService.addPoints(
                    bottle.sender_id,
                    3, // RECEIVE_REPLY points
                    'receive_reply',
                    '收到漂流瓶回复',
                    replyId
                );

                // 🎉 新增：发送通知给原作者
                try {
                    await NotificationService.sendBottleReplyNotification(
                        bottle.sender_id,
                        {
                            bottleId: data.bottleId,
                            replyContent: data.content,
                            replierUsername: data.senderUsername,
                            replierId: data.senderId,
                            mediaType: data.mediaType,
                            mediaFileId: data.mediaFileId
                        }
                    );
                    logger.info(`回复通知发送成功: 瓶子${data.bottleId} -> 用户${bottle.sender_id}`);
                } catch (notificationError) {
                    logger.error(`发送回复通知失败: ${notificationError}`);
                    // 即使通知发送失败，也不影响回复功能的正常运行
                }

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

    // 根据ID获取漂流瓶
    static async getBottleById(bottleId: string): Promise<Bottle | null> {
        return await dbGet(`
            SELECT * FROM bottles 
            WHERE id = ?
        `, [bottleId]) as Bottle | null;
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

        // 构造完整的统计数据，确保字段匹配前端期望
        const completeStats = {
            user_id: userId,
            bottles_thrown: stats?.bottles_thrown || 0,
            bottles_picked: stats?.bottles_picked || 0,
            bottles_replied: stats?.bottles_replied || 0,  // 从数据库表获取
            points_earned: userPoints?.total_points || 0,  // 用户的总积分
            last_throw_time: stats?.last_throw_time,
            last_pick_time: stats?.last_pick_time,
            last_reply_time: stats?.last_reply_time
        };

        return {
            stats: completeStats,
            recentThrown: thrownBottles,
            recentPicked: pickedBottles,
            points: userPoints,
            achievements: achievements.slice(0, 3) // 最近3个成就
        };
    }

    // 获取全局统计（增强版）
    static async getGlobalStats() {
        const [bottles, activeBottles, replies, users, totalPoints, topUserData] = await Promise.all([
            dbGet(`SELECT COUNT(*) as count FROM bottles`) as Promise<{ count: number }>,
            dbGet(`SELECT COUNT(*) as count FROM bottles WHERE is_active = 1`) as Promise<{ count: number }>,
            dbGet(`SELECT COUNT(*) as count FROM replies`) as Promise<{ count: number }>,
            dbGet(`SELECT COUNT(*) as count FROM user_stats`) as Promise<{ count: number }>,
            dbGet(`SELECT SUM(total_points) as total FROM user_points`) as Promise<{ total: number }>,
            dbGet(`
                SELECT user_id, username, total_points, level_name 
                FROM user_points 
                ORDER BY total_points DESC 
                LIMIT 1
            `) as Promise<{ user_id: number; username: string; total_points: number; level_name: string } | null>
        ]);

        let topUser = null;
        if (topUserData) {
            // 使用UserService获取友好的显示名称
            const displayName = await (await import('./user-service')).UserService.getUserDisplayName(topUserData.user_id);
            topUser = {
                username: displayName,
                points: topUserData.total_points,
                level: topUserData.level_name
            };
        }

        return {
            totalBottles: bottles.count,
            activeBottles: activeBottles.count,
            totalReplies: replies.count,
            totalUsers: users.count,
            totalPoints: totalPoints.total || 0,
            topUser
        };
    }

    // 检查用户今日投放次数
    static async getUserTodayBottleCount(userId: number): Promise<number> {
        // 获取今天的日期字符串
        const today = new Date().toLocaleDateString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-');

        const result = await dbGet(`
            SELECT COUNT(*) as count FROM bottles 
            WHERE sender_id = ? AND DATE(created_at) = ?
        `, [userId, today]) as { count: number };
        
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
                ?
            )
        `, [userId, username, userId, userId, getCurrentTimestamp()]);
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
                ?
            )
        `, [userId, username, userId, userId, getCurrentTimestamp()]);
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

    // 🆕 获取用户丢弃统计
    static async getUserDiscardStats(userId: number): Promise<{
        totalDiscarded: number;
        recentDiscarded: any[];
    }> {
        const [totalDiscarded, recentDiscarded] = await Promise.all([
            dbGet(`
                SELECT COUNT(*) as count 
                FROM bottle_discards 
                WHERE user_id = ?
            `, [userId]) as Promise<{ count: number }>,
            dbAll(`
                SELECT bd.*, b.content, b.created_at as bottle_created_at
                FROM bottle_discards bd
                JOIN bottles b ON bd.bottle_id = b.id
                WHERE bd.user_id = ?
                ORDER BY bd.discarded_at DESC
                LIMIT 5
            `, [userId])
        ]);

        return {
            totalDiscarded: totalDiscarded.count,
            recentDiscarded
        };
    }

    // 🆕 获取瓶子的丢弃统计
    static async getBottleDiscardStats(bottleId: string): Promise<{
        discardCount: number;
        discardUsers: number[];
    }> {
        const [discardInfo, discardUsers] = await Promise.all([
            dbGet(`
                SELECT discard_count
                FROM bottles
                WHERE id = ?
            `, [bottleId]) as Promise<{ discard_count: number } | null>,
            dbAll(`
                SELECT user_id
                FROM bottle_discards
                WHERE bottle_id = ?
            `, [bottleId]) as Promise<{ user_id: number }[]>
        ]);

        return {
            discardCount: discardInfo?.discard_count || 0,
            discardUsers: discardUsers.map(d => d.user_id)
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

            // 计算24小时前的时间
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
            const twentyFourHoursAgoStr = twentyFourHoursAgo.toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/\//g, '-');

            // 检查瓶子是否属于用户且在24小时内
            const bottle = await dbGet(`
                SELECT * FROM bottles 
                WHERE id = ? AND sender_id = ? 
                AND created_at > ?
            `, [bottleId, userId, twentyFourHoursAgoStr]) as Bottle | null;

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
                SET status = 'used', updated_at = ?
                WHERE user_id = ? AND item_id = 'message_recall' AND status = 'active'
                LIMIT 1
            `, [getCurrentTimestamp(), userId]);

            logger.info(`用户 ${userId} 撤回漂流瓶: ${bottleId}`);
            return true;
        } catch (error) {
            logger.error('撤回漂流瓶失败:', error);
            throw error;
        }
    }

    // 更新用户统计 - 新增回复统计逻辑
    private static async updateUserStatsForReply(userId: number, username?: string): Promise<void> {
        const field = 'bottles_replied';
        const timeField = 'last_reply_time';
        
        await dbRun(`
            INSERT OR REPLACE INTO user_stats (user_id, username, ${field}, ${timeField})
            VALUES (
                ?, 
                COALESCE(?, (SELECT username FROM user_stats WHERE user_id = ?)),
                COALESCE((SELECT ${field} FROM user_stats WHERE user_id = ?), 0) + 1,
                ?
            )
        `, [userId, username, userId, userId, getCurrentTimestamp()]);
    }
} 