import { Context } from 'telegraf';
import { logger } from './logger';

/**
 * 转义 Markdown 特殊字符
 * @param text 要转义的文本
 * @returns 转义后的文本
 */
export const escapeMarkdown = (text: string): string => {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
};

/**
 * 安全发送 Markdown 消息，如果失败则使用纯文本
 * @param ctx Telegraf 上下文
 * @param message 消息内容
 * @param options 发送选项
 * @returns Promise<void>
 */
export const safeReplyMarkdown = async (
    ctx: Context, 
    message: string, 
    options: any = {}
): Promise<void> => {
    try {
        await ctx.reply(message, { ...options, parse_mode: 'Markdown' });
    } catch (markdownError) {
        logger.warn('Markdown 发送失败，使用纯文本:', markdownError);
        
        // 移除 Markdown 格式符号，使用纯文本
        const plainText = message
            .replace(/\*\*(.*?)\*\*/g, '$1')  // 移除粗体
            .replace(/\*(.*?)\*/g, '$1')      // 移除斜体
            .replace(/`(.*?)`/g, '$1')        // 移除代码
            .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // 移除链接
        
        await ctx.reply(plainText, { ...options, parse_mode: undefined });
    }
};

/**
 * 安全回复消息，如果原消息不存在则直接发送
 * @param ctx Telegraf 上下文
 * @param message 消息内容
 * @param messageId 要回复的消息ID
 * @param options 发送选项
 * @returns Promise<void>
 */
export const safeReplyToMessage = async (
    ctx: Context,
    message: string,
    messageId: number,
    options: any = {}
): Promise<void> => {
    try {
        await ctx.reply(message, {
            ...options,
            reply_parameters: { message_id: messageId }
        });
    } catch (replyError) {
        logger.warn('回复消息失败，直接发送:', replyError);
        await ctx.reply(message, options);
    }
}; 