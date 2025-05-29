// 骗子用户信息接口
export interface IScammer {
    id: number;
    user_id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    reason: string;
    evidence?: string;
    added_by: number;
    status: 'active' | 'appealed' | 'removed';
    created_at: string;
    updated_at: string;
}

// 骗子广播记录接口
export interface IScammerBroadcast {
    id: number;
    scammer_id: number;
    chat_id: number;
    message_id?: number;
    broadcast_type: 'warning' | 'alert' | 'update';
    content: string;
    created_at: string;
}

// 骗子申诉接口
export interface IScammerAppeal {
    id: number;
    scammer_id: number;
    user_id: number;
    appeal_reason: string;
    evidence?: string;
    status: 'pending' | 'approved' | 'rejected';
    admin_response?: string;
    reviewed_by?: number;
    created_at: string;
    updated_at: string;
}

// 群组配置接口
export interface IGroupConfig {
    id: number;
    chat_id: number;
    chat_title?: string;
    enable_scammer_broadcast: boolean;
    broadcast_interval: number; // 分钟
    last_broadcast_at?: string;
    created_at: string;
    updated_at: string;
}

// 管理员操作日志接口
export interface IAdminLog {
    id: number;
    admin_id: number;
    action: string;
    target_user_id?: number;
    details: string;
    created_at: string;
}

// 用户积分信息接口
export interface IUserPoints {
    user_id: number;
    username?: string;
    total_points: number;
    available_points: number;
    level: number;
    level_name: string;
    daily_checkin_streak: number;
    last_checkin_date?: string;
    vip_expires_at?: string;
    created_at: string;
    updated_at: string;
}

// 积分交易记录接口
export interface IPointsTransaction {
    id: string;
    user_id: number;
    amount: number;
    type: 'earn' | 'spend';
    action: string;
    description: string;
    reference_id?: string;
    multiplier?: number;
    created_at: string;
}

// 积分商店商品接口
export interface IPointsShopItem {
    id: string;
    name: string;
    description: string;
    category: 'privilege' | 'decoration' | 'special';
    price: number;
    duration_days?: number;
    is_active: boolean;
    stock_limit?: number;
    level_required?: number;
    created_at: string;
}

// 用户购买记录接口
export interface IUserPurchase {
    id: string;
    user_id: number;
    item_id: string;
    item_name: string;
    price: number;
    status: 'active' | 'expired' | 'used';
    expires_at?: string;
    created_at: string;
    updated_at: string;
}

// 等级配置接口
export interface ILevelConfig {
    level: number;
    name: string;
    min_points: number;
    max_points: number;
    perks: string[];
    daily_bonus: number;
    icon: string;
}

// 成就接口
export interface IAchievement {
    id: string;
    name: string;
    description: string;
    condition_type: string;
    condition_value: number;
    reward_points: number;
    icon: string;
    is_active: boolean;
    created_at: string;
}

// 用户成就记录接口
export interface IUserAchievement {
    id: string;
    user_id: number;
    achievement_id: string;
    achievement_name: string;
    reward_points: number;
    unlocked_at: string;
}

// 签到结果接口
export interface ICheckinResult {
    success: boolean;
    points: number;
    streak: number;
    message: string;
    level_bonus?: number;
    streak_bonus?: number;
}

// 购买结果接口
export interface IPurchaseResult {
    success: boolean;
    message: string;
    purchase?: IUserPurchase;
    remaining_points?: number;
} 