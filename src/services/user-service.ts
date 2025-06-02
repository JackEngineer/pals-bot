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
                SELECT * FROM user_profiles WHERE user_id = ?
            `, [userId]) as UserInfo | null;

            if (!userInfo && telegramUser) {
                // 创建新用户信息记录
                const displayName = this.generateDisplayName(telegramUser);
                const currentTime = getCurrentTimestamp();
                await dbRun(`
                    INSERT INTO user_profiles (user_id, username, first_name, last_name, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [userId, telegramUser.username, telegramUser.first_name, telegramUser.last_name, currentTime, currentTime]);

                userInfo = await dbGet(`
                    SELECT * FROM user_profiles WHERE user_id = ?
                `, [userId]) as UserInfo;
            } else if (userInfo && telegramUser) {
                // 更新现有用户信息
                const currentTime = getCurrentTimestamp();
                await dbRun(`
                    UPDATE user_profiles 
                    SET username = ?, first_name = ?, last_name = ?, updated_at = ?
                    WHERE user_id = ?
                `, [telegramUser.username, telegramUser.first_name, telegramUser.last_name, currentTime, userId]);

                userInfo = { ...userInfo, ...telegramUser };
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
            
            // 优先级1: 来自user_profiles的真实姓名
            if (userInfo) {
                if (userInfo.first_name && userInfo.last_name) {
                    return `${userInfo.first_name} ${userInfo.last_name}`;
                } else if (userInfo.first_name) {
                    return userInfo.first_name;
                } else if (userInfo.username) {
                    return `@${userInfo.username}`;
                }
            }
            
            // 优先级2: 从user_points表中获取username作为备选
            const userPoints = await dbGet(`
                SELECT username FROM user_points WHERE user_id = ?
            `, [userId]) as { username?: string } | null;
            
            if (userPoints && userPoints.username) {
                return `@${userPoints.username}`;
            }
            
            // 优先级3: 生成友好的匿名昵称（与排行榜逻辑保持一致）
            const suffixNum = parseInt(String(userId).slice(-4));
            const adjectives = ['神秘', '匿名', '隐身', '未知', '潜水', '低调'];
            const nouns = ['船员', '水手', '探险家', '旅行者', '漂流者', '冒险者'];
            const adj = adjectives[suffixNum % adjectives.length];
            const noun = nouns[Math.floor(suffixNum / 1000) % nouns.length];
            return `${adj}${noun}${String(userId).slice(-2)}`;
        } catch (error) {
            logger.error('获取用户显示名称失败:', error);
            // 错误情况下也生成友好昵称
            const suffixNum = parseInt(String(userId).slice(-4));
            const adjectives = ['神秘', '匿名', '隐身', '未知', '潜水', '低调'];
            const nouns = ['船员', '水手', '探险家', '旅行者', '漂流者', '冒险者'];
            const adj = adjectives[suffixNum % adjectives.length];
            const noun = nouns[Math.floor(suffixNum / 1000) % nouns.length];
            return `${adj}${noun}${String(userId).slice(-2)}`;
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
            const currentTime = getCurrentTimestamp();
            
            await dbRun(`
                INSERT OR REPLACE INTO user_profiles (user_id, username, first_name, last_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, telegramUser.username, telegramUser.first_name, telegramUser.last_name, currentTime, currentTime]);
            
            return true;
        } catch (error) {
            logger.error('更新用户信息失败:', error);
            return false;
        }
    }
} 