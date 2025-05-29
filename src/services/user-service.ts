import { dbGet, dbRun } from './database';
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

export interface UserInfo {
    user_id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    display_name?: string;
    updated_at: string;
}

export class UserService {
    // 获取或创建用户信息
    static async getUserInfo(userId: number, telegramUser?: {
        username?: string;
        first_name?: string;
        last_name?: string;
    }): Promise<UserInfo | null> {
        try {
            let userInfo = await dbGet(`
                SELECT * FROM user_info WHERE user_id = ?
            `, [userId]) as UserInfo | null;

            if (!userInfo && telegramUser) {
                // 创建新用户信息记录
                const displayName = this.generateDisplayName(telegramUser);
                await dbRun(`
                    INSERT INTO user_info (user_id, username, first_name, last_name, display_name)
                    VALUES (?, ?, ?, ?, ?)
                `, [userId, telegramUser.username, telegramUser.first_name, telegramUser.last_name, displayName]);

                userInfo = await dbGet(`
                    SELECT * FROM user_info WHERE user_id = ?
                `, [userId]) as UserInfo;
            } else if (userInfo && telegramUser) {
                // 更新现有用户信息
                const displayName = this.generateDisplayName(telegramUser);
                const currentTime = getCurrentTimestamp();
                await dbRun(`
                    UPDATE user_info 
                    SET username = ?, first_name = ?, last_name = ?, display_name = ?, updated_at = ?
                    WHERE user_id = ?
                `, [telegramUser.username, telegramUser.first_name, telegramUser.last_name, displayName, currentTime, userId]);

                userInfo = { ...userInfo, ...telegramUser, display_name: displayName };
            }

            return userInfo;
        } catch (error) {
            logger.error('获取用户信息失败:', error);
            return null;
        }
    }

    // 生成友好的显示名称
    static generateDisplayName(telegramUser: {
        username?: string;
        first_name?: string;
        last_name?: string;
    }): string {
        if (telegramUser.first_name && telegramUser.last_name) {
            return `${telegramUser.first_name} ${telegramUser.last_name}`;
        } else if (telegramUser.first_name) {
            return telegramUser.first_name;
        } else if (telegramUser.username) {
            return `@${telegramUser.username}`;
        } else {
            return '匿名用户';
        }
    }

    // 获取用户的友好显示名称
    static async getUserDisplayName(userId: number): Promise<string> {
        try {
            const userInfo = await this.getUserInfo(userId);
            
            if (userInfo && userInfo.display_name) {
                return userInfo.display_name;
            }
            
            // 从user_points表中获取username作为备选
            const userPoints = await dbGet(`
                SELECT username FROM user_points WHERE user_id = ?
            `, [userId]) as { username?: string } | null;
            
            if (userPoints && userPoints.username) {
                return `@${userPoints.username}`;
            }
            
            // 生成用户ID后四位作为最后备选
            const userIdSuffix = String(userId).slice(-4);
            return `用户${userIdSuffix}`;
        } catch (error) {
            logger.error('获取用户显示名称失败:', error);
            const userIdSuffix = String(userId).slice(-4);
            return `用户${userIdSuffix}`;
        }
    }

    // 批量获取用户显示名称
    static async getBatchUserDisplayNames(userIds: number[]): Promise<Map<number, string>> {
        const result = new Map<number, string>();
        
        try {
            for (const userId of userIds) {
                const displayName = await this.getUserDisplayName(userId);
                result.set(userId, displayName);
            }
        } catch (error) {
            logger.error('批量获取用户显示名称失败:', error);
        }
        
        return result;
    }

    // 更新用户信息（从Telegram API获取最新信息时使用）
    static async updateUserInfo(userId: number, telegramUser: {
        username?: string;
        first_name?: string;
        last_name?: string;
    }): Promise<boolean> {
        try {
            const displayName = this.generateDisplayName(telegramUser);
            const currentTime = getCurrentTimestamp();
            
            await dbRun(`
                INSERT OR REPLACE INTO user_info (user_id, username, first_name, last_name, display_name, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, telegramUser.username, telegramUser.first_name, telegramUser.last_name, displayName, currentTime]);
            
            return true;
        } catch (error) {
            logger.error('更新用户信息失败:', error);
            return false;
        }
    }
} 