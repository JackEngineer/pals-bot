import { dbGet, dbRun, dbAll } from './database';
import { logger } from '../utils/logger';

interface ChatSession {
    id: string;
    user1_id: number;
    user2_id: number;
    bottle_id: string;
    started_at: string;
    ended_at?: string;
    status: 'active' | 'ended';
}

export class ChatService {
    // 创建聊天会话
    static async createChatSession(
        initiatorId: number,
        targetId: number,
        bottleId: string
    ): Promise<string> {
        try {
            const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await dbRun(`
                INSERT INTO chat_sessions (id, user1_id, user2_id, bottle_id, status)
                VALUES (?, ?, ?, ?, 'active')
            `, [sessionId, initiatorId, targetId, bottleId]);
            
            logger.info(`创建聊天会话: ${sessionId} (${initiatorId} <-> ${targetId})`);
            return sessionId;
        } catch (error) {
            logger.error('创建聊天会话失败:', error);
            throw error;
        }
    }

    // 获取用户的活跃聊天会话
    static async getActiveChat(userId: number): Promise<ChatSession | null> {
        try {
            return await dbGet(`
                SELECT * FROM chat_sessions 
                WHERE (user1_id = ? OR user2_id = ?) AND status = 'active'
                ORDER BY started_at DESC
                LIMIT 1
            `, [userId, userId]) as ChatSession | null;
        } catch (error) {
            logger.error('获取活跃聊天失败:', error);
            return null;
        }
    }

    // 获取聊天对方的用户ID
    static async getChatPartner(userId: number, sessionId: string): Promise<number | null> {
        try {
            const session = await dbGet(`
                SELECT user1_id, user2_id FROM chat_sessions 
                WHERE id = ? AND status = 'active'
            `, [sessionId]) as { user1_id: number; user2_id: number } | null;
            
            if (!session) return null;
            
            return session.user1_id === userId ? session.user2_id : session.user1_id;
        } catch (error) {
            logger.error('获取聊天伙伴失败:', error);
            return null;
        }
    }

    // 结束聊天会话
    static async endChatSession(userId: number): Promise<boolean> {
        try {
            const result = await dbRun(`
                UPDATE chat_sessions 
                SET status = 'ended', ended_at = CURRENT_TIMESTAMP
                WHERE (user1_id = ? OR user2_id = ?) AND status = 'active'
            `, [userId, userId]);
            
            const success = result.changes > 0;
            if (success) {
                logger.info(`结束聊天会话: 用户${userId}`);
            }
            return success;
        } catch (error) {
            logger.error('结束聊天会话失败:', error);
            return false;
        }
    }

    // 检查用户是否在聊天中
    static async isUserInChat(userId: number): Promise<boolean> {
        try {
            const session = await this.getActiveChat(userId);
            return session !== null;
        } catch (error) {
            return false;
        }
    }

    // 记录聊天消息（可选，用于统计）
    static async logChatMessage(
        sessionId: string,
        senderId: number,
        content: string,
        mediaType?: string
    ): Promise<void> {
        try {
            await dbRun(`
                INSERT INTO chat_messages (session_id, sender_id, content, media_type)
                VALUES (?, ?, ?, ?)
            `, [sessionId, senderId, content, mediaType]);
        } catch (error) {
            logger.error('记录聊天消息失败:', error);
            // 不抛出错误，因为这只是记录功能
        }
    }

    // 获取用户的聊天历史统计
    static async getUserChatStats(userId: number): Promise<{
        totalSessions: number;
        activeSessions: number;
        totalMessages: number;
    }> {
        try {
            const [sessions, activeCount, messageCount] = await Promise.all([
                dbGet(`
                    SELECT COUNT(*) as count FROM chat_sessions 
                    WHERE user1_id = ? OR user2_id = ?
                `, [userId, userId]) as Promise<{ count: number }>,
                dbGet(`
                    SELECT COUNT(*) as count FROM chat_sessions 
                    WHERE (user1_id = ? OR user2_id = ?) AND status = 'active'
                `, [userId, userId]) as Promise<{ count: number }>,
                dbGet(`
                    SELECT COUNT(*) as count FROM chat_messages cm
                    JOIN chat_sessions cs ON cm.session_id = cs.id
                    WHERE cm.sender_id = ?
                `, [userId]) as Promise<{ count: number }>
            ]);

            return {
                totalSessions: sessions.count,
                activeSessions: activeCount.count,
                totalMessages: messageCount.count
            };
        } catch (error) {
            logger.error('获取聊天统计失败:', error);
            return {
                totalSessions: 0,
                activeSessions: 0,
                totalMessages: 0
            };
        }
    }
} 