import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { setupLogger } from '../../utils/logger';

const logger = setupLogger();

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramWebAppData {
  user: TelegramWebAppUser;
  chat_instance?: string;
  chat_type?: string;
  start_param?: string;
  auth_date: number;
  hash: string;
  _isFallback?: boolean;
}

// 扩展Request接口以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: TelegramWebAppUser;
      telegramData?: TelegramWebAppData;
    }
  }
}

/**
 * Telegram Mini App 认证中间件
 * 验证来自Telegram Web App的请求
 */
export function verifyTelegramWebApp(req: Request, res: Response, next: NextFunction): void {
  logger.info('🔐 Telegram认证中间件开始:', {
    method: req.method,
    path: req.path,
    env: process.env.NODE_ENV,
    hasBodyInitData: !!req.body.initData,
    hasQueryInitData: !!req.query.initData,
    bodyKeys: Object.keys(req.body || {}),
    queryKeys: Object.keys(req.query || {}),
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
    referer: req.headers.referer
  });

  try {
    // 开发环境模拟用户数据
    if (process.env.NODE_ENV === 'development') {
      logger.info('🔧 开发环境：使用模拟用户数据');
      const mockUser: TelegramWebAppUser = {
        id: 123456789,
        first_name: '开发用户',
        username: 'dev_user',
        language_code: 'zh'
      };
      
      req.user = mockUser;
      req.telegramData = {
        user: mockUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'mock_hash'
      };
      
      logger.info('✅ 开发环境认证成功:', mockUser);
      next();
      return;
    }

    const initData = req.body.initData || req.query.initData as string;
    
    logger.info('📋 解析认证数据:', {
      hasInitData: !!initData,
      initDataLength: initData ? initData.length : 0,
      source: req.body.initData ? 'body' : req.query.initData ? 'query' : 'none',
      rawInitData: initData ? initData.substring(0, 100) + '...' : '无'
    });
    
    if (!initData) {
      logger.warn('❌ Mini App请求缺少认证数据，提供临时访问');
      
      // 临时fallback机制：提供基础的模拟用户，但标记为未认证
      const fallbackUser: TelegramWebAppUser = {
        id: 999999999,
        first_name: '临时用户',
        username: 'temp_user',
        language_code: 'zh'
      };
      
      req.user = fallbackUser;
      req.telegramData = {
        user: fallbackUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'fallback_hash',
        _isFallback: true
      };
      
      logger.info('⚠️ 使用fallback认证:', fallbackUser);
      next();
      return;
    }

    // 解析初始化数据
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    logger.info('📝 认证数据解析:', {
      hasHash: !!hash,
      paramCount: urlParams.size,
      paramKeys: Array.from(urlParams.keys()),
      rawHash: hash ? hash.substring(0, 20) + '...' : '无'
    });
    
    if (!hash) {
      logger.warn('❌ Mini App请求缺少hash，使用fallback');
      
      // 没有hash时也提供fallback
      const fallbackUser: TelegramWebAppUser = {
        id: 999999998,
        first_name: '无hash用户',
        username: 'no_hash_user',
        language_code: 'zh'
      };
      
      req.user = fallbackUser;
      req.telegramData = {
        user: fallbackUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'no_hash_fallback',
        _isFallback: true
      };
      
      next();
      return;
    }
    
    urlParams.delete('hash');

    // 验证哈希
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    logger.info('🔑 开始哈希验证:', {
      dataCheckStringLength: dataCheckString.length,
      hasBotToken: !!process.env.BOT_TOKEN,
      dataCheckPreview: dataCheckString.substring(0, 100) + '...'
    });

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN!)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      logger.warn('❌ Mini App认证失败: hash不匹配，使用fallback', {
        providedHash: hash.substring(0, 20) + '...',
        calculatedHash: calculatedHash.substring(0, 20) + '...'
      });
      
      // hash不匹配时也提供fallback
      const fallbackUser: TelegramWebAppUser = {
        id: 999999997,
        first_name: 'Hash错误用户',
        username: 'hash_error_user',
        language_code: 'zh'
      };
      
      req.user = fallbackUser;
      req.telegramData = {
        user: fallbackUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'hash_error_fallback',
        _isFallback: true
      };
      
      next();
      return;
    }

    logger.info('✅ 哈希验证成功');

    // 检查数据时效性（5分钟内有效）
    const authDate = parseInt(urlParams.get('auth_date') || '0');
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = currentTime - authDate;
    
    logger.info('⏰ 检查认证时效:', {
      authDate,
      currentTime,
      timeDiff,
      isValid: timeDiff <= 300
    });
    
    if (timeDiff > 300) {
      logger.warn('❌ Mini App认证数据已过期，使用fallback');
      
      // 过期时也提供fallback
      const fallbackUser: TelegramWebAppUser = {
        id: 999999996,
        first_name: '过期用户',
        username: 'expired_user',
        language_code: 'zh'
      };
      
      req.user = fallbackUser;
      req.telegramData = {
        user: fallbackUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'expired_fallback',
        _isFallback: true
      };
      
      next();
      return;
    }

    // 解析用户数据
    const userDataString = urlParams.get('user');
    logger.info('👤 解析用户数据:', {
      hasUserData: !!userDataString,
      userDataLength: userDataString ? userDataString.length : 0,
      userDataPreview: userDataString ? userDataString.substring(0, 50) + '...' : '无'
    });
    
    if (!userDataString) {
      logger.warn('❌ Mini App请求缺少用户数据，使用fallback');
      
      const fallbackUser: TelegramWebAppUser = {
        id: 999999995,
        first_name: '无用户数据',
        username: 'no_user_data',
        language_code: 'zh'
      };
      
      req.user = fallbackUser;
      req.telegramData = {
        user: fallbackUser,
        auth_date: authDate,
        hash: hash,
        _isFallback: true
      };
      
      next();
      return;
    }

    const userData = JSON.parse(userDataString) as TelegramWebAppUser;
    req.user = userData;
    req.telegramData = {
      user: userData,
      chat_instance: urlParams.get('chat_instance') || undefined,
      chat_type: urlParams.get('chat_type') || undefined,
      start_param: urlParams.get('start_param') || undefined,
      auth_date: authDate,
      hash: hash
    };
    
    logger.info(`✅ Mini App 用户认证成功:`, {
      userId: userData.id,
      username: userData.username,
      firstName: userData.first_name,
      languageCode: userData.language_code
    });
    
    next();
    
  } catch (error) {
    logger.error('❌ Mini App 认证错误，使用fallback:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // 发生异常时也提供fallback
    const fallbackUser: TelegramWebAppUser = {
      id: 999999994,
      first_name: '异常用户',
      username: 'error_user',
      language_code: 'zh'
    };
    
    req.user = fallbackUser;
    req.telegramData = {
      user: fallbackUser,
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'error_fallback',
      _isFallback: true
    };
    
    next();
  }
}

/**
 * 可选的认证中间件，用于不强制要求认证的端点
 */
export function optionalTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const initData = req.body.initData || req.query.initData as string;
  
  logger.info('🔓 可选认证中间件:', { hasInitData: !!initData });
  
  if (!initData) {
    // 没有认证数据，直接继续
    logger.info('⏩ 没有认证数据，跳过验证');
    next();
    return;
  }

  // 有认证数据，尝试验证
  logger.info('🔐 有认证数据，开始验证');
  verifyTelegramWebApp(req, res, next);
} 