import { dbGet, dbRun, dbAll } from './database';
import { logger } from '../utils/logger';

export interface FriendRequest {
    id: number;
    requester_id: number;
    target_id: number;
    session_id: string;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
    message?: string;
    created_at: string;
    updated_at: string;
}

export interface Friendship {
    id: number;
    user1_id: number;
    user2_id: number;
    status: 'active' | 'blocked';
    created_at: string;
}

export class FriendService {
    // 发送好友申请
    static async sendFriendRequest(
        requesterId: number,
        targetId: number,
        sessionId: string,
        message?: string
    ): Promise<boolean> {
        try {
            // 检查是否已经是好友
            const areFriends = await this.areFriends(requesterId, targetId);
            if (areFriends) {
                throw new Error('已经是好友关系');
            }

            // 检查是否已有待处理的申请
            const existingRequest = await this.getPendingRequest(requesterId, targetId, sessionId);
            if (existingRequest) {
                throw new Error('已有待处理的好友申请');
            }

            await dbRun(`
                INSERT INTO friend_requests (requester_id, target_id, session_id, message)
                VALUES (?, ?, ?, ?)
            `, [requesterId, targetId, sessionId, message]);

            logger.info(`发送好友申请: ${requesterId} -> ${targetId} (会话: ${sessionId})`);
            return true;
        } catch (error) {
            logger.error('发送好友申请失败:', error);
            throw error;
        }
    }

    // 接受好友申请
    static async acceptFriendRequest(requestId: number): Promise<boolean> {
        try {
            // 获取申请信息
            const request = await dbGet(`
                SELECT * FROM friend_requests 
                WHERE id = ? AND status = 'pending'
            `, [requestId]) as FriendRequest | null;

            if (!request) {
                throw new Error('找不到待处理的好友申请');
            }

            // 开启事务
            await dbRun('BEGIN TRANSACTION');

            try {
                // 更新申请状态
                await dbRun(`
                    UPDATE friend_requests 
                    SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [requestId]);

                // 创建好友关系 (确保 user1_id < user2_id)
                const [user1, user2] = request.requester_id < request.target_id 
                    ? [request.requester_id, request.target_id]
                    : [request.target_id, request.requester_id];

                await dbRun(`
                    INSERT OR IGNORE INTO friendships (user1_id, user2_id)
                    VALUES (?, ?)
                `, [user1, user2]);

                await dbRun('COMMIT');

                logger.info(`好友申请已接受: ${request.requester_id} <-> ${request.target_id}`);
                return true;
            } catch (error) {
                await dbRun('ROLLBACK');
                throw error;
            }
        } catch (error) {
            logger.error('接受好友申请失败:', error);
            throw error;
        }
    }

    // 拒绝好友申请
    static async rejectFriendRequest(requestId: number): Promise<boolean> {
        try {
            const result = await dbRun(`
                UPDATE friend_requests 
                SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'pending'
            `, [requestId]);

            const success = result.changes > 0;
            if (success) {
                logger.info(`好友申请已拒绝: 申请ID ${requestId}`);
            }
            return success;
        } catch (error) {
            logger.error('拒绝好友申请失败:', error);
            throw error;
        }
    }

    // 检查是否为好友
    static async areFriends(userId1: number, userId2: number): Promise<boolean> {
        try {
            const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
            
            logger.info(`检查好友关系: ${userId1} <-> ${userId2}, 排序后: ${user1} <-> ${user2}`);
            
            const friendship = await dbGet(`
                SELECT id FROM friendships 
                WHERE user1_id = ? AND user2_id = ? AND status = 'active'
            `, [user1, user2]);

            logger.info(`好友关系查询结果:`, friendship);
            const result = Boolean(friendship);
            logger.info(`areFriends返回结果: ${result}`);
            
            return result;
        } catch (error) {
            logger.error('检查好友关系失败:', error);
            return false;
        }
    }

    // 获取待处理的好友申请
    static async getPendingRequest(
        requesterId: number, 
        targetId: number, 
        sessionId: string
    ): Promise<FriendRequest | null> {
        try {
            return await dbGet(`
                SELECT * FROM friend_requests 
                WHERE requester_id = ? AND target_id = ? AND session_id = ? AND status = 'pending'
            `, [requesterId, targetId, sessionId]) as FriendRequest | null;
        } catch (error) {
            logger.error('获取待处理申请失败:', error);
            return null;
        }
    }

    // 根据ID获取好友申请
    static async getFriendRequestById(requestId: number): Promise<FriendRequest | null> {
        try {
            return await dbGet(`
                SELECT * FROM friend_requests WHERE id = ?
            `, [requestId]) as FriendRequest | null;
        } catch (error) {
            logger.error('获取好友申请失败:', error);
            return null;
        }
    }

    // 获取用户的好友列表
    static async getFriends(userId: number): Promise<number[]> {
        try {
            const friends = await dbAll(`
                SELECT 
                    CASE 
                        WHEN user1_id = ? THEN user2_id 
                        ELSE user1_id 
                    END as friend_id
                FROM friendships 
                WHERE (user1_id = ? OR user2_id = ?) AND status = 'active'
            `, [userId, userId, userId]) as { friend_id: number }[];

            return friends.map(f => f.friend_id);
        } catch (error) {
            logger.error('获取好友列表失败:', error);
            return [];
        }
    }

    // 获取用户收到的待处理好友申请
    static async getPendingRequestsReceived(userId: number): Promise<FriendRequest[]> {
        try {
            return await dbAll(`
                SELECT * FROM friend_requests 
                WHERE target_id = ? AND status = 'pending'
                ORDER BY created_at DESC
            `, [userId]) as FriendRequest[];
        } catch (error) {
            logger.error('获取待处理申请失败:', error);
            return [];
        }
    }

    // 获取用户发送的待处理好友申请
    static async getPendingRequestsSent(userId: number): Promise<FriendRequest[]> {
        try {
            return await dbAll(`
                SELECT * FROM friend_requests 
                WHERE requester_id = ? AND status = 'pending'
                ORDER BY created_at DESC
            `, [userId]) as FriendRequest[];
        } catch (error) {
            logger.error('获取发送的申请失败:', error);
            return [];
        }
    }

    // 删除好友关系
    static async removeFriend(userId1: number, userId2: number): Promise<boolean> {
        try {
            const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
            
            const result = await dbRun(`
                UPDATE friendships 
                SET status = 'blocked'
                WHERE user1_id = ? AND user2_id = ? AND status = 'active'
            `, [user1, user2]);

            const success = result.changes > 0;
            if (success) {
                logger.info(`删除好友关系: ${user1} <-> ${user2}`);
            }
            return success;
        } catch (error) {
            logger.error('删除好友关系失败:', error);
            return false;
        }
    }

    // 获取好友关系统计
    static async getFriendStats(userId: number): Promise<{
        totalFriends: number;
        pendingRequestsReceived: number;
        pendingRequestsSent: number;
    }> {
        try {
            const [friendCount, receivedCount, sentCount] = await Promise.all([
                this.getFriends(userId).then(friends => friends.length),
                this.getPendingRequestsReceived(userId).then(requests => requests.length),
                this.getPendingRequestsSent(userId).then(requests => requests.length)
            ]);

            return {
                totalFriends: friendCount,
                pendingRequestsReceived: receivedCount,
                pendingRequestsSent: sentCount
            };
        } catch (error) {
            logger.error('获取好友统计失败:', error);
            return {
                totalFriends: 0,
                pendingRequestsReceived: 0,
                pendingRequestsSent: 0
            };
        }
    }
} 