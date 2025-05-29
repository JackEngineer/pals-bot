import { Bottle, UserStats } from '../services/database';
import moment from 'moment';

// 设置中文语言
moment.locale('zh-cn');

export function formatBottleMessage(bottle: Bottle): string {
    const timeAgo = moment(bottle.created_at).fromNow();
    // const senderUsername = bottle.sender_username ? `@${bottle.sender_username}` : '匿名用户';
    const senderUsername = '匿名用户';
    
    return (
        `🍾 你捡到了一个漂流瓶！\n\n` +
        `📝 内容: ${bottle.content}\n` +
        `👤 来自: ${senderUsername}\n` +
        `⏰ 投放时间: ${timeAgo}\n` +
        `🆔 瓶子编号: ${bottle.id}\n\n` +
        `这个漂流瓶在大海中漂流了 ${timeAgo}，现在被你捡到了！ 🌊\n` +
        `💰 捡拾奖励: +5积分`
    );
}

export function formatUserStats(userStats: any): string {
    const { stats, recentThrown, recentPicked, points, achievements } = userStats;
    
    let message = `📊 你的漂流瓶统计\n\n`;
    
    // 积分和等级信息
    if (points) {
        message += `🏆 等级: ${points.level_name} (Lv.${points.level})\n`;
        message += `💰 总积分: ${points.total_points} | 可用: ${points.available_points}\n`;
        message += `🔥 连续签到: ${points.daily_checkin_streak} 天\n\n`;
    }
    
    message += `🚀 投放的漂流瓶: ${stats.bottles_thrown} 个\n`;
    message += `🎣 捡到的漂流瓶: ${stats.bottles_picked} 个\n\n`;
    
    // 最近成就
    if (achievements && achievements.length > 0) {
        message += `🏆 最近解锁成就:\n`;
        achievements.forEach((achievement: any) => {
            message += `• ${achievement.achievement_name} (+${achievement.reward_points}积分)\n`;
        });
        message += `\n`;
    }
    
    message += `最近投放的漂流瓶:\n`;
    message += (recentThrown.length > 0 
        ? recentThrown.slice(0, 3).map((bottle: Bottle, index: number) => 
            `${index + 1}. ${bottle.content.substring(0, 30)}${bottle.content.length > 30 ? '...' : ''} (${moment(bottle.created_at).fromNow()})`
        ).join('\n')
        : '暂无记录'
    );
    
    message += `\n\n最近捡到的漂流瓶:\n`;
    message += (recentPicked.length > 0
        ? recentPicked.slice(0, 3).map((bottle: Bottle, index: number) => 
            `${index + 1}. ${bottle.content.substring(0, 30)}${bottle.content.length > 30 ? '...' : ''} (${moment(bottle.picked_at).fromNow()})`
        ).join('\n')
        : '暂无记录'
    );
    
    return message;
}

export function formatGlobalStats(stats: any): string {
    let message = `🌊 漂流瓶世界统计\n\n`;
    message += `📦 总漂流瓶数: ${stats.totalBottles} 个\n`;
    message += `🌊 海上漂流中: ${stats.activeBottles} 个\n`;
    message += `💬 总回复数: ${stats.totalReplies} 条\n`;
    message += `👥 参与用户: ${stats.totalUsers} 人\n`;
    message += `💰 总积分: ${stats.totalPoints || 0} 分\n`;
    
    if (stats.topUser) {
        message += `\n👑 积分王者: ${stats.topUser.username}\n`;
        message += `   ${stats.topUser.level} | ${stats.topUser.points}积分\n`;
    }
    
    message += `\n快来投放你的漂流瓶，让更多人发现吧！ 🚀`;
    
    return message;
}

export function formatThrowSuccess(bottleId: string, content: string): string {
    return (
        `🌊 漂流瓶投放成功！\n\n` +
        `📝 内容: ${content}\n` +
        `🆔 瓶子编号: ${bottleId}\n` +
        `⏰ 投放时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n\n` +
        `你的漂流瓶正在大海中漂流，等待有缘人捡拾... 🌊\n` +
        `💰 投放奖励: +10积分`
    );
}

export function formatReplySuccess(bottleId: string): string {
    return (
        `💬 回复发送成功！\n\n` +
        `你的回复已经送达漂流瓶的主人。\n` +
        `瓶子编号: ${bottleId}\n\n` +
        `也许这就是一段美好缘分的开始... ✨\n` +
        `💰 回复奖励: +8积分`
    );
}

export function formatHelpMessage(): string {
    return (
        `🆘 漂流瓶机器人帮助\n\n` +
        `📝 基础功能:\n` +
        `• /throw <内容> - 投放漂流瓶 (+10积分)\n` +
        `• /pick - 随机捡拾漂流瓶 (+5积分)\n` +
        `• /reply <瓶子ID> <内容> - 回复漂流瓶 (+8积分)\n` +
        `• 直接发送消息也可以投放漂流瓶\n\n` +
        
        `💬 全新聊天功能:\n` +
        `• 🔔 收到回复时立即通知原作者\n` +
        `• 💌 可选择"发起聊天"或"忽略"回复\n` +
        `• 🎭 支持匿名实时聊天\n` +
        `• 📱 多媒体消息转发\n` +
        `• /endchat - 结束当前聊天会话\n\n` +
        
        `💰 积分系统:\n` +
        `• /points - 查看积分和等级\n` +
        `• /checkin - 每日签到 (+5积分起)\n` +
        `• /shop - 积分商店\n` +
        `• /buy <商品ID> - 购买商品\n` +
        `• /leaderboard - 积分排行榜\n` +
        `• /achievements - 我的成就\n` +
        `• /vip - VIP专属功能\n\n` +
        
        `📊 统计功能:\n` +
        `• /stats - 个人统计\n` +
        `• /global - 全局统计\n` +
        `• /status - 机器人状态\n\n` +
        
        `🏆 等级系统:\n` +
        `• 🌊 新手水手 (0-99积分)\n` +
        `• ⚓ 见习船员 (100-299积分)\n` +
        `• 🚢 资深航海者 (300-599积分)\n` +
        `• 🏴‍☠️ 海洋探索家 (600-999积分)\n` +
        `• 👑 漂流瓶大师 (1000+积分)\n\n` +
        
        `💡 获得积分的方式:\n` +
        `• 投放漂流瓶: +10积分\n` +
        `• 捡拾漂流瓶: +5积分\n` +
        `• 回复漂流瓶: +8积分\n` +
        `• 收到回复: +3积分 (含通知 🔔)\n` +
        `• 每日签到: +5积分起（等级越高越多）\n` +
        `• 深夜活跃: 1.5倍积分 (22:00-06:00)\n` +
        `• 周末活跃: 1.2倍积分\n` +
        `• VIP会员: 1.2倍积分\n` +
        `• 连续签到7天: +20积分奖励\n` +
        `• 连续签到30天: +100积分奖励\n\n` +
        
        `🛍️ 积分商店热门商品:\n` +
        `• 💎VIP会员: 200积分 (30天)\n` +
        `• 📝额外投放次数: 100积分 (1天)\n` +
        `• 🎨彩色消息: 50积分 (7天)\n` +
        `• 💫双倍积分卡: 250积分 (24小时)\n\n` +
        
        `📢 聊天功能亮点:\n` +
        `• 🔔 实时回复通知 - 有人回复你的漂流瓶时立即收到通知\n` +
        `• 💌 聊天邀请系统 - 可选择与回复者进一步交流\n` +
        `• 🎭 匿名聊天保护 - 通过机器人中转，保护隐私\n` +
        `• 📱 多媒体支持 - 图片、语音、视频、文档都能传递\n` +
        `• 🚪 自由进出 - 随时可以结束聊天或拒绝邀请\n` +
        `• 👫 好友申请 - 聊天达到10条消息后可申请添加好友\n` +
        `• 💬 私聊功能 - 成为好友后可查看信息并直接私聊\n\n` +
        
        `🌊 聊天流程:\n` +
        `1. 投放漂流瓶 → 2. 有人回复 → 3. 收到通知\n` +
        `4. 选择"发起聊天"或"忽略" → 5. 对方接受/拒绝\n` +
        `6. 开始匿名聊天 → 7. 随时 /endchat 结束\n\n` +
        
        `👫 好友功能:\n` +
        `• 聊天互动满10条消息后显示"申请添加好友"按钮\n` +
        `• 对方同意后成为好友，可查看基本信息\n` +
        `• 点击"去私聊"直接开启 Telegram 私聊\n` +
        `• 使用 /friends 命令管理好友和申请\n\n` +
        
        `🎮 常用命令:\n` +
        `• /throw - 投放漂流瓶\n` +
        `• /pick - 捡拾漂流瓶\n` +
        `• /endchat - 结束聊天\n` +
        `• /friends - 好友管理\n` +
        `• /shop - 积分商店\n` +
        `• /profile - 个人资料\n\n` +
        
        `注意事项:\n` +
        `• 不能捡拾自己投放的漂流瓶\n` +
        `• 每天基础投放限制: ${parseInt(process.env.MAX_BOTTLES_PER_DAY || '5')} 个\n` +
        `• VIP用户和购买特权可增加投放次数\n` +
        `• 聊天是匿名的，尊重对方隐私\n` +
        `• 可以随时拒绝聊天邀请或好友申请\n` +
        `• 成为好友后保护好个人信息安全\n\n` +
        
        `开始你的漂流瓶之旅，遇见更多有趣的朋友吧！ 🚀`
    );
}

// 新增积分相关格式化函数

export function formatPointsInfo(userPoints: any, transactions: any[], privileges: any): string {
    let message = `💰 积分详情\n\n`;
    message += `🏆 ${userPoints.level_name} (Lv.${userPoints.level})\n`;
    message += `💎 总积分: ${userPoints.total_points}\n`;
    message += `💰 可用积分: ${userPoints.available_points}\n`;
    message += `🔥 连续签到: ${userPoints.daily_checkin_streak} 天\n`;

    // 显示特权状态
    const activePrivileges = [];
    if (privileges.isVip) activePrivileges.push('💎VIP会员');
    if (privileges.hasExtraThrows) activePrivileges.push('📝额外投放');
    if (privileges.hasDoublePoints) activePrivileges.push('💫双倍积分');
    if (privileges.hasLuckyBoost) activePrivileges.push('🍀幸运加成');

    if (activePrivileges.length > 0) {
        message += `\n🎯 活跃特权: ${activePrivileges.join(', ')}\n`;
    }

    if (transactions.length > 0) {
        message += `\n📊 最近交易:\n`;
        transactions.slice(0, 5).forEach(tx => {
            const sign = tx.type === 'earn' ? '+' : '-';
            const amount = Math.abs(tx.amount);
            message += `${sign}${amount} ${tx.description}\n`;
        });
    }

    return message;
}

export function formatShopItems(items: any[], userPoints: number, userLevel: string): string {
    let message = `🛒 积分商店\n`;
    message += `💰 你的积分: ${userPoints}\n`;
    message += `🏆 你的等级: ${userLevel}\n\n`;
    
    const categories = ['privilege', 'decoration', 'special'];
    const categoryNames = {
        'privilege': '🔥 功能特权',
        'decoration': '✨ 装饰道具', 
        'special': '💫 特殊物品'
    };

    for (const category of categories) {
        const categoryItems = items.filter(item => item.category === category);
        if (categoryItems.length > 0) {
            message += `${categoryNames[category as keyof typeof categoryNames]}\n`;
            categoryItems.forEach(item => {
                const canAfford = userPoints >= item.price ? '✅' : '❌';
                message += `${canAfford} ${item.name} - ${item.price}积分\n`;
                message += `   ${item.description}\n`;
                if (item.duration_days) {
                    message += `   ⏰ 有效期: ${item.duration_days}天\n`;
                }
                message += `   /buy ${item.id}\n\n`;
            });
        }
    }

    message += `💡 使用 /buy <商品ID> 来购买商品`;
    return message;
}

export function formatLeaderboard(leaderboard: any[]): string {
    let message = `🏆 积分排行榜 (Top 10)\n\n`;
    
    leaderboard.forEach((user, index) => {
        const rank = index + 1;
        const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `${rank}.`;
        const displayName = user.username ? `@${user.username}` : `用户${String(user.user_id).slice(-4)}`;
        const vipMark = user.vip_expires_at && new Date(user.vip_expires_at) > new Date() ? '💎' : '';
        message += `${medal} ${displayName}${vipMark}\n`;
        message += `   ${user.level_name} | ${user.total_points}积分\n\n`;
    });

    return message;
}

export function formatAchievements(achievements: any[]): string {
    let message = `🏆 你的成就列表\n\n`;
    
    achievements.forEach(achievement => {
        const unlockDate = new Date(achievement.unlocked_at).toLocaleDateString('zh-CN');
        message += `🎖️ ${achievement.achievement_name}\n`;
        message += `   奖励: ${achievement.reward_points}积分\n`;
        message += `   解锁时间: ${unlockDate}\n\n`;
    });

    return message;
}

export function formatVipPanel(userPoints: any, purchases: any[], transactions: any[]): string {
    let message = `💎 VIP专属面板\n\n`;
    message += `🏆 等级: ${userPoints.level_name}\n`;
    message += `💰 积分: ${userPoints.available_points}\n`;
    
    if (userPoints.vip_expires_at) {
        const expiresAt = new Date(userPoints.vip_expires_at);
        message += `⏰ VIP到期: ${expiresAt.toLocaleString('zh-CN')}\n`;
    }

    message += `\n🎯 活跃特权:\n`;
    purchases.forEach(purchase => {
        const expiresAt = purchase.expires_at ? 
            new Date(purchase.expires_at).toLocaleDateString('zh-CN') : '永久';
        message += `• ${purchase.item_name} (${expiresAt})\n`;
    });

    message += `\n📊 最近积分收入:\n`;
    const recentEarnings = transactions
        .filter(tx => tx.type === 'earn')
        .slice(0, 5);
    
    recentEarnings.forEach(tx => {
        message += `+${tx.amount} - ${tx.description}\n`;
    });

    return message;
}

export function formatCheckinResult(result: any): string {
    let message = `✅ ${result.message}`;
    
    if (result.level_bonus && result.level_bonus > 0) {
        message += `\n🎖️ 等级奖励: +${result.level_bonus}积分`;
    }
    
    if (result.streak_bonus && result.streak_bonus > 0) {
        message += `\n🎉 连击奖励: +${result.streak_bonus}积分`;
    }

    return message;
}

export function formatPurchaseSuccess(result: any): string {
    let message = `${result.message}`;
    if (result.remaining_points !== undefined) {
        message += `\n💰 剩余积分: ${result.remaining_points}`;
    }
    if (result.purchase?.expires_at) {
        const expiresAt = new Date(result.purchase.expires_at);
        message += `\n⏰ 到期时间: ${expiresAt.toLocaleString('zh-CN')}`;
    }
    return message;
} 