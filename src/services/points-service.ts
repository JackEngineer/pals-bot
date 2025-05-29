import { dbGet, dbAll, dbRun } from './database';
import { v4 as uuidv4 } from 'uuid';
import { 
    IUserPoints, 
    IPointsTransaction, 
    IPointsShopItem, 
    IUserPurchase, 
    ILevelConfig,
    ICheckinResult,
    IPurchaseResult,
    IAchievement,
    IUserAchievement
} from '../types';
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

export class PointsService {
    // 等级配置
    private static readonly LEVEL_CONFIG: ILevelConfig[] = [
        { 
            level: 1, 
            name: '🌊 新手水手', 
            min_points: 0, 
            max_points: 99, 
            perks: ['基础功能'], 
            daily_bonus: 5, 
            icon: '🌊' 
        },
        { 
            level: 2, 
            name: '⚓ 见习船员', 
            min_points: 100, 
            max_points: 299, 
            perks: ['基础功能', '解锁基础商品', '签到+2积分'], 
            daily_bonus: 7, 
            icon: '⚓' 
        },
        { 
            level: 3, 
            name: '🚢 资深航海者', 
            min_points: 300, 
            max_points: 599, 
            perks: ['基础功能', '解锁高级商品', '签到+5积分', '⚓消息标识'], 
            daily_bonus: 10, 
            icon: '🚢' 
        },
        { 
            level: 4, 
            name: '🏴‍☠️ 海洋探索家', 
            min_points: 600, 
            max_points: 999, 
            perks: ['基础功能', '解锁专属商品', '签到+10积分', '🏴‍☠️消息标识', '排行榜详情'], 
            daily_bonus: 15, 
            icon: '🏴‍☠️' 
        },
        { 
            level: 5, 
            name: '👑 漂流瓶大师', 
            min_points: 1000, 
            max_points: Infinity, 
            perks: ['所有功能', '解锁全部商品', '签到+15积分', '👑消息标识', '特殊管理权限'], 
            daily_bonus: 20, 
            icon: '👑' 
        }
    ];

    // 积分行为配置
    private static readonly POINTS_CONFIG = {
        THROW_BOTTLE: 10,
        PICK_BOTTLE: 5,
        REPLY_BOTTLE: 8,
        RECEIVE_REPLY: 3,
        REPLY_BONUS: 2,
        DAILY_CHECKIN: 5,
        STREAK_BONUS_7DAYS: 20,
        STREAK_BONUS_30DAYS: 100,
        NIGHT_MULTIPLIER: 1.5,
        WEEKEND_MULTIPLIER: 1.2,
        HOLIDAY_MULTIPLIER: 2.0,
        VIP_MULTIPLIER: 1.2,
        DOUBLE_POINTS_MULTIPLIER: 2.0
    };

    // 获取或创建用户积分记录
    static async getUserPoints(userId: number, username?: string): Promise<IUserPoints> {
        let userPoints = await dbGet(`
            SELECT * FROM user_points WHERE user_id = ?
        `, [userId]) as IUserPoints | null;

        if (!userPoints) {
            // 创建新用户积分记录，使用 INSERT OR IGNORE 避免唯一约束冲突
            await dbRun(`
                INSERT OR IGNORE INTO user_points (user_id, username, total_points, available_points, level, level_name)
                VALUES (?, ?, 0, 0, 1, ?)
            `, [userId, username, this.LEVEL_CONFIG[0].name]);

            // 再次查询用户记录
            userPoints = await dbGet(`
                SELECT * FROM user_points WHERE user_id = ?
            `, [userId]) as IUserPoints;
        } else if (username && !userPoints.username) {
            // 如果用户记录存在但没有用户名，更新用户名
            const currentTime = getCurrentTimestamp();
            await dbRun(`
                UPDATE user_points SET username = ?, updated_at = ?
                WHERE user_id = ?
            `, [username, currentTime, userId]);
            userPoints.username = username;
        }

        return userPoints;
    }

    // 添加积分
    static async addPoints(
        userId: number,
        amount: number,
        action: string,
        description: string,
        referenceId?: string,
        username?: string
    ): Promise<IPointsTransaction> {
        try {
            // 计算积分倍数
            const multiplier = await this.calculateMultiplier(userId);
            const finalAmount = Math.floor(amount * multiplier);

            const transactionId = uuidv4();

            // 记录交易
            await dbRun(`
                INSERT INTO points_transactions (id, user_id, amount, type, action, description, reference_id, multiplier)
                VALUES (?, ?, ?, 'earn', ?, ?, ?, ?)
            `, [transactionId, userId, finalAmount, action, description, referenceId, multiplier]);

            // 更新用户积分
            await this.updateUserPoints(userId, finalAmount, username);

            // 检查成就
            await this.checkAchievements(userId);

            const transaction = await dbGet(`
                SELECT * FROM points_transactions WHERE id = ?
            `, [transactionId]) as IPointsTransaction;

            logger.info(`用户 ${userId} 获得 ${finalAmount} 积分 (${action})`);
            return transaction;
        } catch (error) {
            logger.error('添加积分失败:', error);
            throw error;
        }
    }

    // 扣除积分
    static async spendPoints(
        userId: number,
        amount: number,
        action: string,
        description: string,
        referenceId?: string
    ): Promise<boolean> {
        try {
            const userPoints = await this.getUserPoints(userId);

            if (userPoints.available_points < amount) {
                return false; // 积分不足
            }

            const transactionId = uuidv4();

            // 记录交易
            await dbRun(`
                INSERT INTO points_transactions (id, user_id, amount, type, action, description, reference_id)
                VALUES (?, ?, ?, 'spend', ?, ?, ?)
            `, [transactionId, userId, -amount, action, description, referenceId]);

            // 更新用户积分
            const currentTime = getCurrentTimestamp();
            await dbRun(`
                UPDATE user_points 
                SET available_points = available_points - ?, updated_at = ?
                WHERE user_id = ?
            `, [amount, currentTime, userId]);

            logger.info(`用户 ${userId} 消费 ${amount} 积分 (${action})`);
            return true;
        } catch (error) {
            logger.error('扣除积分失败:', error);
            throw error;
        }
    }

    // 每日签到
    static async dailyCheckin(userId: number, username?: string): Promise<ICheckinResult> {
        try {
            const userPoints = await this.getUserPoints(userId, username);
            const today = new Date().toISOString().split('T')[0];

            // 检查是否已签到
            if (userPoints.last_checkin_date === today) {
                return {
                    success: false,
                    points: 0,
                    streak: userPoints.daily_checkin_streak,
                    message: '今日已签到，明天再来吧！'
                };
            }

            // 计算连续签到
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            let newStreak = 1;
            if (userPoints.last_checkin_date === yesterdayStr) {
                newStreak = userPoints.daily_checkin_streak + 1;
            }

            // 计算积分奖励
            const levelConfig = this.getLevelConfig(userPoints.level);
            const basePoints = this.POINTS_CONFIG.DAILY_CHECKIN;
            const levelBonus = levelConfig.daily_bonus - basePoints;
            let totalPoints = levelConfig.daily_bonus;

            // VIP加成
            const isVip = await this.checkVipStatus(userId);
            if (isVip) {
                totalPoints += 3; // VIP额外奖励
            }

            // 连续签到奖励
            let streakBonus = 0;
            if (newStreak === 7) {
                streakBonus = this.POINTS_CONFIG.STREAK_BONUS_7DAYS;
                totalPoints += streakBonus;
            } else if (newStreak === 30) {
                streakBonus = this.POINTS_CONFIG.STREAK_BONUS_30DAYS;
                totalPoints += streakBonus;
            }

            // 更新签到记录
            const currentTime = getCurrentTimestamp();
            await dbRun(`
                UPDATE user_points 
                SET daily_checkin_streak = ?, last_checkin_date = ?, updated_at = ?
                WHERE user_id = ?
            `, [newStreak, today, currentTime, userId]);

            // 添加积分
            let description = `每日签到 (连续${newStreak}天)`;
            if (levelBonus > 0) description += ` +${levelBonus}等级奖励`;
            if (isVip) description += ` +3VIP奖励`;
            if (streakBonus > 0) description += ` +${streakBonus}连击奖励`;

            await this.addPoints(
                userId,
                totalPoints,
                'daily_checkin',
                description,
                undefined,
                username
            );

            let message = `✅ 签到成功！获得 ${totalPoints} 积分，连续签到 ${newStreak} 天`;
            if (streakBonus > 0) {
                message += `\n🎉 连续签到奖励：+${streakBonus}积分`;
            }

            return {
                success: true,
                points: totalPoints,
                streak: newStreak,
                message,
                level_bonus: levelBonus,
                streak_bonus: streakBonus
            };
        } catch (error) {
            logger.error('签到失败:', error);
            throw error;
        }
    }

    // 更新用户积分和等级
    private static async updateUserPoints(userId: number, pointsChange: number, username?: string): Promise<void> {
        try {
            // 先确保用户记录存在
            await this.getUserPoints(userId, username);
            
            // 更新积分
            const currentTime = getCurrentTimestamp();
            await dbRun(`
                UPDATE user_points 
                SET 
                    total_points = total_points + ?,
                    available_points = available_points + ?,
                    username = COALESCE(?, username),
                    updated_at = ?
                WHERE user_id = ?
            `, [pointsChange, pointsChange, username, currentTime, userId]);

            // 检查等级更新
            const userPoints = await this.getUserPoints(userId);
            const newLevel = this.calculateLevel(userPoints.total_points);
            
            if (newLevel.level !== userPoints.level) {
                const levelUpdateTime = getCurrentTimestamp();
                await dbRun(`
                    UPDATE user_points 
                    SET level = ?, level_name = ?, updated_at = ?
                    WHERE user_id = ?
                `, [newLevel.level, newLevel.name, levelUpdateTime, userId]);

                logger.info(`用户 ${userId} 升级到 ${newLevel.name}`);
            }
        } catch (error) {
            logger.error('更新用户积分失败:', error);
            throw error;
        }
    }

    // 计算等级
    private static calculateLevel(totalPoints: number): ILevelConfig {
        for (let i = this.LEVEL_CONFIG.length - 1; i >= 0; i--) {
            const level = this.LEVEL_CONFIG[i];
            if (totalPoints >= level.min_points) {
                return level;
            }
        }
        return this.LEVEL_CONFIG[0];
    }

    // 获取等级配置
    private static getLevelConfig(level: number): ILevelConfig {
        return this.LEVEL_CONFIG.find(l => l.level === level) || this.LEVEL_CONFIG[0];
    }

    // 计算积分倍数（时间加成、VIP加成等）
    private static async calculateMultiplier(userId: number): Promise<number> {
        let multiplier = 1.0;

        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        // 深夜加成 (22:00-06:00)
        if (hour >= 22 || hour < 6) {
            multiplier *= this.POINTS_CONFIG.NIGHT_MULTIPLIER;
        }

        // 周末加成 (周六日)
        if (day === 0 || day === 6) {
            multiplier *= this.POINTS_CONFIG.WEEKEND_MULTIPLIER;
        }

        // VIP加成
        const isVip = await this.checkVipStatus(userId);
        if (isVip) {
            multiplier *= this.POINTS_CONFIG.VIP_MULTIPLIER;
        }

        // 双倍积分卡加成
        const hasDoublePoints = await this.checkUserPurchase(userId, 'double_points_24h');
        if (hasDoublePoints) {
            multiplier *= this.POINTS_CONFIG.DOUBLE_POINTS_MULTIPLIER;
        }

        return multiplier;
    }

    // 检查VIP状态
    static async checkVipStatus(userId: number): Promise<boolean> {
        const userPoints = await this.getUserPoints(userId);
        if (!userPoints.vip_expires_at) return false;
        
        const now = new Date();
        const expiresAt = new Date(userPoints.vip_expires_at);
        return now < expiresAt;
    }

    // 检查用户购买的特权
    static async checkUserPurchase(userId: number, itemId: string): Promise<boolean> {
        const currentTime = getCurrentTimestamp();
        const purchase = await dbGet(`
            SELECT * FROM user_purchases 
            WHERE user_id = ? AND item_id = ? AND status = 'active'
            AND (expires_at IS NULL OR expires_at > ?)
        `, [userId, itemId, currentTime]);
        
        return !!purchase;
    }

    // 获取积分商店商品
    static async getShopItems(category?: string, userLevel: number = 1): Promise<IPointsShopItem[]> {
        let sql = `SELECT * FROM points_shop_items WHERE is_active = 1 AND level_required <= ?`;
        const params: any[] = [userLevel];

        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }

        sql += ` ORDER BY category, level_required, price`;

        return await dbAll(sql, params) as IPointsShopItem[];
    }

    // 购买商品
    static async purchaseItem(userId: number, itemId: string): Promise<IPurchaseResult> {
        try {
            const [userPoints, item] = await Promise.all([
                this.getUserPoints(userId),
                dbGet(`SELECT * FROM points_shop_items WHERE id = ? AND is_active = 1`, [itemId]) as Promise<IPointsShopItem | null>
            ]);

            if (!item) {
                return { success: false, message: '商品不存在或已下架' };
            }

            if (userPoints.level < (item.level_required || 1)) {
                const requiredLevel = this.getLevelConfig(item.level_required || 1);
                return { success: false, message: `需要等级 ${requiredLevel.name} 才能购买此商品` };
            }

            if (userPoints.available_points < item.price) {
                return { 
                    success: false, 
                    message: `积分不足，需要 ${item.price} 积分，当前有 ${userPoints.available_points} 积分` 
                };
            }

            // 检查是否已有同类商品
            if (item.category === 'privilege') {
                const existingPurchase = await this.checkUserPurchase(userId, itemId);
                if (existingPurchase) {
                    return { success: false, message: '你已拥有此特权，无需重复购买' };
                }
            }

            // 扣除积分
            const spendSuccess = await this.spendPoints(
                userId,
                item.price,
                'purchase',
                `购买商品: ${item.name}`,
                itemId
            );

            if (!spendSuccess) {
                return { success: false, message: '积分扣除失败' };
            }

            // 创建购买记录
            const purchaseId = uuidv4();
            let expiresAt = null;
            
            if (item.duration_days) {
                const expireDate = new Date();
                expireDate.setDate(expireDate.getDate() + item.duration_days);
                expiresAt = expireDate.toISOString();
            }

            await dbRun(`
                INSERT INTO user_purchases (id, user_id, item_id, item_name, price, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [purchaseId, userId, itemId, item.name, item.price, expiresAt]);

            // 特殊处理VIP购买
            if (itemId === 'vip_member_30d') {
                const vipUpdateTime = getCurrentTimestamp();
                await dbRun(`
                    UPDATE user_points 
                    SET vip_expires_at = ?, updated_at = ?
                    WHERE user_id = ?
                `, [expiresAt, vipUpdateTime, userId]);
            }

            const purchase = await dbGet(`
                SELECT * FROM user_purchases WHERE id = ?
            `, [purchaseId]) as IUserPurchase;

            const updatedUserPoints = await this.getUserPoints(userId);

            logger.info(`用户 ${userId} 购买商品 ${item.name}`);

            return {
                success: true,
                message: `✅ 成功购买 ${item.name}！`,
                purchase,
                remaining_points: updatedUserPoints.available_points
            };
        } catch (error) {
            logger.error('购买商品失败:', error);
            return { success: false, message: '购买失败，请稍后重试' };
        }
    }

    // 获取用户购买记录
    static async getUserPurchases(userId: number, status?: string): Promise<IUserPurchase[]> {
        let sql = `SELECT * FROM user_purchases WHERE user_id = ?`;
        const params: any[] = [userId];

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY created_at DESC`;

        return await dbAll(sql, params) as IUserPurchase[];
    }

    // 获取用户积分交易记录
    static async getUserTransactions(userId: number, limit: number = 20): Promise<IPointsTransaction[]> {
        return await dbAll(`
            SELECT * FROM points_transactions 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `, [userId, limit]) as IPointsTransaction[];
    }

    // 积分排行榜
    static async getLeaderboard(limit: number = 10): Promise<IUserPoints[]> {
        return await dbAll(`
            SELECT * FROM user_points 
            ORDER BY total_points DESC 
            LIMIT ?
        `, [limit]) as IUserPoints[];
    }

    // 检查成就
    private static async checkAchievements(userId: number): Promise<void> {
        try {
            const achievements = await dbAll(`
                SELECT * FROM achievements WHERE is_active = 1
            `) as IAchievement[];

            const userStats = await this.getUserStats(userId);

            for (const achievement of achievements) {
                // 检查用户是否已获得此成就
                const existingAchievement = await dbGet(`
                    SELECT * FROM user_achievements 
                    WHERE user_id = ? AND achievement_id = ?
                `, [userId, achievement.id]);

                if (existingAchievement) continue;

                let shouldUnlock = false;

                // 根据成就条件检查
                switch (achievement.condition_type) {
                    case 'bottles_thrown':
                        shouldUnlock = userStats.bottles_thrown >= achievement.condition_value;
                        break;
                    case 'replies_sent':
                        shouldUnlock = userStats.replies_sent >= achievement.condition_value;
                        break;
                    case 'checkin_streak':
                        const userPoints = await this.getUserPoints(userId);
                        shouldUnlock = userPoints.daily_checkin_streak >= achievement.condition_value;
                        break;
                    // 可以添加更多成就条件
                }

                if (shouldUnlock) {
                    await this.unlockAchievement(userId, achievement);
                }
            }
        } catch (error) {
            logger.error('检查成就失败:', error);
        }
    }

    // 解锁成就
    private static async unlockAchievement(userId: number, achievement: IAchievement): Promise<void> {
        try {
            const achievementId = uuidv4();
            
            await dbRun(`
                INSERT INTO user_achievements (id, user_id, achievement_id, achievement_name, reward_points)
                VALUES (?, ?, ?, ?, ?)
            `, [achievementId, userId, achievement.id, achievement.name, achievement.reward_points]);

            // 添加成就奖励积分
            await this.addPoints(
                userId,
                achievement.reward_points,
                'achievement',
                `解锁成就: ${achievement.name}`,
                achievementId
            );

            logger.info(`用户 ${userId} 解锁成就: ${achievement.name}`);
        } catch (error) {
            logger.error('解锁成就失败:', error);
        }
    }

    // 获取用户统计（用于成就检查）
    private static async getUserStats(userId: number): Promise<any> {
        const [bottleStats, replyCount] = await Promise.all([
            dbGet(`SELECT bottles_thrown FROM user_stats WHERE user_id = ?`, [userId]),
            dbGet(`SELECT COUNT(*) as count FROM replies WHERE sender_id = ?`, [userId])
        ]);

        return {
            bottles_thrown: bottleStats?.bottles_thrown || 0,
            replies_sent: replyCount?.count || 0
        };
    }

    // 获取用户成就列表
    static async getUserAchievements(userId: number): Promise<IUserAchievement[]> {
        return await dbAll(`
            SELECT * FROM user_achievements 
            WHERE user_id = ? 
            ORDER BY unlocked_at DESC
        `, [userId]) as IUserAchievement[];
    }

    // 清理过期购买记录
    static async cleanupExpiredPurchases(): Promise<void> {
        try {
            const currentTime = getCurrentTimestamp();
            
            await dbRun(`
                UPDATE user_purchases 
                SET status = 'expired', updated_at = ?
                WHERE status = 'active' 
                AND expires_at IS NOT NULL 
                AND expires_at <= ?
            `, [currentTime, currentTime]);

            // 清理过期VIP状态
            await dbRun(`
                UPDATE user_points 
                SET vip_expires_at = NULL, updated_at = ?
                WHERE vip_expires_at IS NOT NULL 
                AND vip_expires_at <= ?
            `, [currentTime, currentTime]);

            logger.info('清理过期购买记录完成');
        } catch (error) {
            logger.error('清理过期购买记录失败:', error);
        }
    }
} 