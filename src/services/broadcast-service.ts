import { Database } from 'sqlite3';
import { Telegraf } from 'telegraf';
import { Context } from 'telegraf';
import { dbGet, dbAll, dbRun } from './database';
import { logger } from '../utils/logger';
import { TelegramRetryHandler } from '../utils/telegram-retry';

// 接口定义
export interface ChatGroup {
    chat_id: number;
    chat_type: 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    is_active: boolean;
    bot_status: 'member' | 'administrator' | 'left' | 'kicked';
    added_at: string;
    last_activity_at: string;
    last_broadcast_at?: string;
    broadcast_enabled: boolean;
}

export interface BroadcastTemplate {
    id: number;
    name: string;
    content: string;
    media_type?: 'photo' | 'voice' | 'video' | 'document';
    media_file_id?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface BroadcastLog {
    id: number;
    template_id?: number;
    chat_id: number;
    message_id?: number;
    status: 'sent' | 'failed' | 'blocked';
    error_message?: string;
    sent_at: string;
}

export interface BroadcastSchedule {
    id: number;
    template_id: number;
    cron_schedule: string;
    is_active: boolean;
    last_run_at?: string;
    next_run_at?: string;
    created_at: string;
}

export class BroadcastService {
    private static bot: Telegraf | null = null;

    // 设置bot实例
    static setBotInstance(bot: Telegraf): void {
        this.bot = bot;
        logger.info('✅ 广播服务已连接bot实例');
    }

    // ================== 群组管理 ==================

    /**
     * 注册新的群组或频道
     */
    static async registerChatGroup(ctx: Context): Promise<boolean> {
        if (!ctx.chat) return false;

        const chat = ctx.chat;
        const chatId = chat.id;
        const chatType = chat.type as 'group' | 'supergroup' | 'channel';
        const title = 'title' in chat ? chat.title : '';
        const username = 'username' in chat ? chat.username : '';

        try {
            // 检查是否已存在
            const existing = await dbGet(
                'SELECT * FROM chat_groups WHERE chat_id = ?',
                [chatId]
            );

            if (existing) {
                // 更新现有记录
                await dbRun(`
                    UPDATE chat_groups 
                    SET title = ?, username = ?, is_active = 1, 
                        last_activity_at = CURRENT_TIMESTAMP,
                        bot_status = 'member'
                    WHERE chat_id = ?
                `, [title, username, chatId]);
                
                logger.info(`更新群组信息: ${title} (${chatId})`);
            } else {
                // 插入新记录
                await dbRun(`
                    INSERT INTO chat_groups 
                    (chat_id, chat_type, title, username, is_active, bot_status)
                    VALUES (?, ?, ?, ?, 1, 'member')
                `, [chatId, chatType, title, username]);
                
                logger.info(`注册新群组: ${title} (${chatId})`);
            }

            return true;
        } catch (error) {
            logger.error('注册群组失败:', error);
            return false;
        }
    }

    /**
     * 标记机器人离开群组
     */
    static async markBotLeft(chatId: number): Promise<void> {
        try {
            await dbRun(`
                UPDATE chat_groups 
                SET bot_status = 'left', is_active = 0
                WHERE chat_id = ?
            `, [chatId]);
            
            logger.info(`机器人已离开群组: ${chatId}`);
        } catch (error) {
            logger.error('标记机器人离开群组失败:', error);
        }
    }

    /**
     * 获取所有活跃的群组
     */
    static async getActiveChatGroups(): Promise<ChatGroup[]> {
        try {
            const groups = await dbAll(`
                SELECT * FROM chat_groups 
                WHERE is_active = 1 AND broadcast_enabled = 1 
                  AND bot_status IN ('member', 'administrator')
                ORDER BY last_activity_at DESC
            `);
            
            return groups;
        } catch (error) {
            logger.error('获取活跃群组失败:', error);
            return [];
        }
    }

    /**
     * 启用/禁用群组广播
     */
    static async toggleGroupBroadcast(chatId: number, enabled: boolean): Promise<boolean> {
        try {
            await dbRun(`
                UPDATE chat_groups 
                SET broadcast_enabled = ?
                WHERE chat_id = ?
            `, [enabled ? 1 : 0, chatId]);
            
            logger.info(`${enabled ? '启用' : '禁用'}群组广播: ${chatId}`);
            return true;
        } catch (error) {
            logger.error('切换群组广播状态失败:', error);
            return false;
        }
    }

    // ================== 广播模板管理 ==================

    /**
     * 创建广播模板
     */
    static async createBroadcastTemplate(
        name: string,
        content: string,
        mediaType?: string,
        mediaFileId?: string
    ): Promise<number | null> {
        try {
            const result = await dbRun(`
                INSERT INTO broadcast_templates 
                (name, content, media_type, media_file_id)
                VALUES (?, ?, ?, ?)
            `, [name, content, mediaType, mediaFileId]);
            
            logger.info(`创建广播模板: ${name}`);
            return result.lastID!;
        } catch (error) {
            logger.error('创建广播模板失败:', error);
            return null;
        }
    }

    /**
     * 获取所有活跃的广播模板
     */
    static async getBroadcastTemplates(): Promise<BroadcastTemplate[]> {
        try {
            const templates = await dbAll(`
                SELECT * FROM broadcast_templates 
                WHERE is_active = 1 
                ORDER BY created_at DESC
            `);
            
            return templates;
        } catch (error) {
            logger.error('获取广播模板失败:', error);
            return [];
        }
    }

    /**
     * 获取指定广播模板
     */
    static async getBroadcastTemplate(id: number): Promise<BroadcastTemplate | null> {
        try {
            const template = await dbGet(`
                SELECT * FROM broadcast_templates 
                WHERE id = ? AND is_active = 1
            `, [id]);
            
            return template || null;
        } catch (error) {
            logger.error('获取广播模板失败:', error);
            return null;
        }
    }

    /**
     * 更新广播模板
     */
    static async updateBroadcastTemplate(
        id: number,
        updates: Partial<Pick<BroadcastTemplate, 'name' | 'content' | 'media_type' | 'media_file_id'>>
    ): Promise<boolean> {
        try {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            
            await dbRun(`
                UPDATE broadcast_templates 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [...values, id]);
            
            logger.info(`更新广播模板: ${id}`);
            return true;
        } catch (error) {
            logger.error('更新广播模板失败:', error);
            return false;
        }
    }

    /**
     * 删除广播模板（软删除）
     */
    static async deleteBroadcastTemplate(id: number): Promise<boolean> {
        try {
            await dbRun(`
                UPDATE broadcast_templates 
                SET is_active = 0
                WHERE id = ?
            `, [id]);
            
            logger.info(`删除广播模板: ${id}`);
            return true;
        } catch (error) {
            logger.error('删除广播模板失败:', error);
            return false;
        }
    }

    // ================== 广播发送 ==================

    /**
     * 执行广播发送
     */
    static async executeBroadcast(templateId: number): Promise<{
        totalGroups: number;
        successCount: number;
        failedCount: number;
        details: BroadcastLog[];
    }> {
        if (!this.bot) {
            throw new Error('Bot实例未设置');
        }

        // 获取广播模板
        const template = await this.getBroadcastTemplate(templateId);
        if (!template) {
            throw new Error('广播模板不存在');
        }

        // 获取机器人信息，用于构建私聊链接
        let botUsername = '';
        try {
            const botInfo = await TelegramRetryHandler.executeWithRetry(
                () => this.bot!.telegram.getMe(),
                'getMe for broadcast username'
            );
            botUsername = botInfo.username || '';
        } catch (error) {
            logger.error('获取机器人信息失败:', error);
            // 不影响广播，只是没有私聊按钮
        }

        // 构建私聊按钮
        const replyMarkup = botUsername ? {
            inline_keyboard: [[
                {
                    text: '💬 私聊机器人',
                    url: `https://t.me/${botUsername}`
                }
            ]]
        } : undefined;

        // 获取所有活跃群组
        const groups = await this.getActiveChatGroups();
        if (groups.length === 0) {
            logger.warn('没有活跃的群组可以广播');
            return {
                totalGroups: 0,
                successCount: 0,
                failedCount: 0,
                details: []
            };
        }

        const results: BroadcastLog[] = [];
        let successCount = 0;
        let failedCount = 0;

        logger.info(`开始广播: 模板 ${template.name}, 目标群组 ${groups.length} 个`);

        // 依次向每个群组发送广播
        for (const group of groups) {
            try {
                // 添加短暂延迟，避免发送过快
                await new Promise(resolve => setTimeout(resolve, 1000));

                let messageId: number | undefined;

                // 使用重试机制发送消息
                const sendOperation = async () => {
                    // 根据媒体类型发送不同的消息
                    if (template.media_type && template.media_file_id) {
                        switch (template.media_type) {
                            case 'photo':
                                const photoMsg = await this.bot!.telegram.sendPhoto(
                                    group.chat_id,
                                    template.media_file_id,
                                    { 
                                        caption: template.content,
                                        reply_markup: replyMarkup
                                    }
                                );
                                return photoMsg.message_id;
                            case 'voice':
                                const voiceMsg = await this.bot!.telegram.sendVoice(
                                    group.chat_id,
                                    template.media_file_id,
                                    { 
                                        caption: template.content,
                                        reply_markup: replyMarkup
                                    }
                                );
                                return voiceMsg.message_id;
                            case 'video':
                                const videoMsg = await this.bot!.telegram.sendVideo(
                                    group.chat_id,
                                    template.media_file_id,
                                    { 
                                        caption: template.content,
                                        reply_markup: replyMarkup
                                    }
                                );
                                return videoMsg.message_id;
                            case 'document':
                                const docMsg = await this.bot!.telegram.sendDocument(
                                    group.chat_id,
                                    template.media_file_id,
                                    { 
                                        caption: template.content,
                                        reply_markup: replyMarkup
                                    }
                                );
                                return docMsg.message_id;
                            default:
                                const textMsg = await this.bot!.telegram.sendMessage(
                                    group.chat_id,
                                    template.content,
                                    { reply_markup: replyMarkup }
                                );
                                return textMsg.message_id;
                        }
                    } else {
                        const textMsg = await this.bot!.telegram.sendMessage(
                            group.chat_id,
                            template.content,
                            { reply_markup: replyMarkup }
                        );
                        return textMsg.message_id;
                    }
                };

                // 使用重试机制执行发送操作
                messageId = await TelegramRetryHandler.executeWithRetry(
                    sendOperation,
                    `broadcast to group ${group.chat_id}`,
                    2 // 广播重试次数较少，避免延迟过长
                );

                // 记录成功日志
                await this.logBroadcast(templateId, group.chat_id, messageId, 'sent');
                
                // 更新群组最后广播时间
                await dbRun(`
                    UPDATE chat_groups 
                    SET last_broadcast_at = CURRENT_TIMESTAMP
                    WHERE chat_id = ?
                `, [group.chat_id]);

                successCount++;
                results.push({
                    id: 0, // 临时ID
                    template_id: templateId,
                    chat_id: group.chat_id,
                    message_id: messageId,
                    status: 'sent',
                    sent_at: new Date().toISOString()
                });

                logger.info(`广播发送成功: 群组 ${group.title || group.chat_id}`);

            } catch (error: any) {
                // 处理发送失败
                let status: 'failed' | 'blocked' = 'failed';
                
                // 检查是否是被踢出或阻止
                if (error.code === 403 || error.description?.includes('bot was blocked') || 
                    error.description?.includes('chat not found')) {
                    status = 'blocked';
                    
                    // 更新群组状态
                    await this.markBotLeft(group.chat_id);
                }

                // 记录失败日志
                await this.logBroadcast(templateId, group.chat_id, undefined, status, error.message);

                failedCount++;
                results.push({
                    id: 0, // 临时ID
                    template_id: templateId,
                    chat_id: group.chat_id,
                    status: status,
                    error_message: error.message,
                    sent_at: new Date().toISOString()
                });

                logger.error(`广播发送失败: 群组 ${group.title || group.chat_id}`, error);
            }
        }

        logger.info(`广播完成: 成功 ${successCount}, 失败 ${failedCount}`);

        return {
            totalGroups: groups.length,
            successCount,
            failedCount,
            details: results
        };
    }

    /**
     * 向指定群组发送广播
     */
    static async sendBroadcastToGroup(
        chatId: number,
        content: string,
        mediaType?: string,
        mediaFileId?: string
    ): Promise<boolean> {
        if (!this.bot) {
            throw new Error('Bot实例未设置');
        }

        try {
            // 获取机器人信息，用于构建私聊链接
            let botUsername = '';
            try {
                const botInfo = await TelegramRetryHandler.executeWithRetry(
                    () => this.bot!.telegram.getMe(),
                    'getMe for broadcast username'
                );
                botUsername = botInfo.username || '';
            } catch (error) {
                logger.error('获取机器人信息失败:', error);
                // 不影响广播，只是没有私聊按钮
            }

            // 构建私聊按钮
            const replyMarkup = botUsername ? {
                inline_keyboard: [[
                    {
                        text: '💬 私聊机器人',
                        url: `https://t.me/${botUsername}`
                    }
                ]]
            } : undefined;

            // 使用重试机制发送消息
            const sendOperation = async () => {
                if (mediaType && mediaFileId) {
                    switch (mediaType) {
                        case 'photo':
                            return await this.bot!.telegram.sendPhoto(chatId, mediaFileId, { 
                                caption: content,
                                reply_markup: replyMarkup
                            });
                        case 'voice':
                            return await this.bot!.telegram.sendVoice(chatId, mediaFileId, { 
                                caption: content,
                                reply_markup: replyMarkup
                            });
                        case 'video':
                            return await this.bot!.telegram.sendVideo(chatId, mediaFileId, { 
                                caption: content,
                                reply_markup: replyMarkup
                            });
                        case 'document':
                            return await this.bot!.telegram.sendDocument(chatId, mediaFileId, { 
                                caption: content,
                                reply_markup: replyMarkup
                            });
                        default:
                            return await this.bot!.telegram.sendMessage(chatId, content, { 
                                reply_markup: replyMarkup 
                            });
                    }
                } else {
                    return await this.bot!.telegram.sendMessage(chatId, content, { 
                        reply_markup: replyMarkup 
                    });
                }
            };

            // 使用重试机制执行发送
            await TelegramRetryHandler.executeWithRetry(
                sendOperation,
                `sendBroadcastToGroup ${chatId}`,
                3 // 重试3次
            );

            return true;
        } catch (error) {
            logger.error(`发送广播到群组 ${chatId} 失败:`, error);
            return false;
        }
    }

    // ================== 日志管理 ==================

    /**
     * 记录广播日志
     */
    static async logBroadcast(
        templateId: number,
        chatId: number,
        messageId?: number,
        status: 'sent' | 'failed' | 'blocked' = 'sent',
        errorMessage?: string
    ): Promise<void> {
        try {
            await dbRun(`
                INSERT INTO broadcast_logs 
                (template_id, chat_id, message_id, status, error_message)
                VALUES (?, ?, ?, ?, ?)
            `, [templateId, chatId, messageId, status, errorMessage]);
        } catch (error) {
            logger.error('记录广播日志失败:', error);
        }
    }

    /**
     * 获取广播统计信息
     */
    static async getBroadcastStats(templateId?: number): Promise<{
        totalSent: number;
        totalFailed: number;
        totalBlocked: number;
        successRate: number;
    }> {
        try {
            let whereClause = '';
            const params: any[] = [];
            
            if (templateId) {
                whereClause = 'WHERE template_id = ?';
                params.push(templateId);
            }

            const stats = await dbGet(`
                SELECT 
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as total_sent,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_failed,
                    COUNT(CASE WHEN status = 'blocked' THEN 1 END) as total_blocked,
                    COUNT(*) as total
                FROM broadcast_logs 
                ${whereClause}
            `, params);

            const successRate = stats.total > 0 ? (stats.total_sent / stats.total * 100) : 0;

            return {
                totalSent: stats.total_sent || 0,
                totalFailed: stats.total_failed || 0,
                totalBlocked: stats.total_blocked || 0,
                successRate: Math.round(successRate * 100) / 100
            };
        } catch (error) {
            logger.error('获取广播统计失败:', error);
            return {
                totalSent: 0,
                totalFailed: 0,
                totalBlocked: 0,
                successRate: 0
            };
        }
    }

    /**
     * 清理旧的广播日志
     */
    static async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
        try {
            const result = await dbRun(`
                DELETE FROM broadcast_logs 
                WHERE sent_at < datetime('now', '-${daysToKeep} days')
            `);
            
            logger.info(`清理了 ${result.changes} 条旧的广播日志`);
            return result.changes || 0;
        } catch (error) {
            logger.error('清理旧广播日志失败:', error);
            return 0;
        }
    }
} 