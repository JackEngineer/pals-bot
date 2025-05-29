import { Context } from 'telegraf';

// 存储待回复的漂流瓶ID (内存存储，实际项目中应该使用数据库)
export const pendingReplies = new Map<number, string>();

// 存储已显示好友申请按钮的会话 (避免重复显示)
export const shownFriendButtons = new Set<string>();

// 存储用户当前正在查看的瓶子ID
export const currentlyViewing = new Map<number, string>();

// 扩展 Context 以支持会话数据
export interface ExtendedContext extends Context {
    pendingReplies?: Map<number, string>;
} 