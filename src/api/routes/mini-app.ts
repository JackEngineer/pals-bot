import express from 'express';
import { verifyTelegramWebApp } from '../middleware/telegram-auth';
import { BottleService } from '../../services/bottle-service';
import { PointsService } from '../../services/points-service';
import { UserService } from '../../services/user-service';
import { PerformanceMonitor } from '../../utils/performance-monitor';
import { setupLogger } from '../../utils/logger';
import { dbGet } from '../../services/database';

const router = express.Router();
const logger = setupLogger();

// 请求日志中间件
router.use((req, res, next) => {
  logger.info('📱 Mini App API请求:', {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress
  });
  next();
});

// 应用认证中间件到所有路由
router.use(verifyTelegramWebApp);

/**
 * 获取用户完整信息和统计
 */
router.get('/user/profile', async (req, res) => {
  const startTime = Date.now();
  logger.info('🔍 获取用户资料请求开始');
  
  try {
    const userId = req.user!.id;
    logger.info('👤 处理用户资料请求:', { userId, username: req.user!.username });
    
    // 确保用户信息存在
    await UserService.getUserInfo(userId, req.user!);
    logger.info('✅ 用户信息验证完成');
    
    const [userStats, pointsInfo] = await Promise.all([
      PerformanceMonitor.monitorAsync(
        () => BottleService.getUserStats(userId),
        'miniapp_user_stats'
      ),
      PerformanceMonitor.monitorAsync(
        () => PointsService.getUserPoints(userId),
        'miniapp_user_points'
      )
    ]);

    logger.info('📊 用户数据获取完成:', {
      userId,
      hasStats: !!userStats,
      hasPoints: !!pointsInfo,
      stats: userStats.stats,
      executionTime: Date.now() - startTime
    });

    const responseData = {
      user: req.user,
      stats: userStats.stats,  // 直接使用 BottleService 返回的完整统计数据
      points: pointsInfo,
      telegram_data: req.telegramData
    };

    res.json({
      success: true,
      data: responseData
    });
    
    logger.info('✅ 用户资料请求成功完成');
    
  } catch (error) {
    logger.error('❌ 获取用户信息失败:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
      executionTime: Date.now() - startTime
    });
    
    res.status(500).json({
      success: false,
      error: '获取用户信息失败'
    });
  }
});

/**
 * 获取漂流瓶列表（分页）
 */
router.get('/bottles', async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 50);
    const type = req.query.type as string; // 'thrown' | 'picked' | 'replied'
    
    let bottles;
    
    if (type === 'thrown') {
      // 获取用户投放的漂流瓶
      bottles = await PerformanceMonitor.monitorAsync(
        () => BottleService.getUserBottles(userId, limit),
        'miniapp_get_thrown_bottles'
      );
    } else if (type === 'picked') {
      // 获取用户捡拾的漂流瓶
      bottles = await PerformanceMonitor.monitorAsync(
        () => BottleService.getPickedBottles(userId, limit),
        'miniapp_get_picked_bottles'
      );
    } else {
      // 获取用户投放的漂流瓶作为默认
      bottles = await PerformanceMonitor.monitorAsync(
        () => BottleService.getUserBottles(userId, limit),
        'miniapp_get_all_bottles'
      );
    }

    res.json({
      success: true,
      data: {
        bottles,
        pagination: {
          page,
          limit,
          type: type || 'all'
        }
      }
    });
    
  } catch (error) {
    logger.error('获取漂流瓶列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取漂流瓶列表失败'
    });
  }
});

/**
 * 投放新漂流瓶
 */
router.post('/bottles/throw', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { content, type = 'text' } = req.body;
    
    // 验证内容
    if (!content || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: '漂流瓶内容不能为空'
      });
      return;
    }
    
    if (content.length > 1000) {
      res.status(400).json({
        success: false,
        error: '漂流瓶内容不能超过1000字符'
      });
      return;
    }

    const result = await PerformanceMonitor.monitorAsync(
      () => BottleService.throwBottle({
        senderId: userId,
        senderUsername: req.user!.username,
        content: content
      }),
      'miniapp_throw_bottle'
    );

    res.json({
      success: true,
      data: { bottleId: result }
    });
    
  } catch (error) {
    logger.error('投放漂流瓶失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '投放失败'
    });
  }
});

/**
 * 捡拾漂流瓶
 */
router.post('/bottles/pick', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const bottle = await PerformanceMonitor.monitorAsync(
      () => BottleService.pickBottle(userId),
      'miniapp_pick_bottle'
    );

    if (!bottle) {
      res.json({
        success: true,
        data: null,
        message: '暂时没有新的漂流瓶，稍后再试试吧~'
      });
      return;
    }

    res.json({
      success: true,
      data: bottle
    });
    
  } catch (error) {
    logger.error('捡拾漂流瓶失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '捡拾失败'
    });
  }
});

/**
 * 回复漂流瓶
 */
router.post('/bottles/:bottleId/reply', async (req, res) => {
  try {
    const userId = req.user!.id;
    const bottleId = req.params.bottleId;
    const { content } = req.body;
    
    if (!bottleId) {
      res.status(400).json({
        success: false,
        error: '无效的漂流瓶ID'
      });
      return;
    }
    
    if (!content || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: '回复内容不能为空'
      });
      return;
    }

    if (content.length > 500) {
      res.status(400).json({
        success: false,
        error: '回复内容不能超过500字符'
      });
      return;
    }

    const result = await PerformanceMonitor.monitorAsync(
      () => BottleService.replyToBottle({
        bottleId,
        senderId: userId,
        senderUsername: req.user!.username,
        content
      }),
      'miniapp_reply_bottle'
    );

    res.json({
      success: true,
      data: { replyId: result }
    });
    
  } catch (error) {
    logger.error('回复漂流瓶失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '回复失败'
    });
  }
});

/**
 * 获取漂流瓶详情和回复
 */
router.get('/bottles/:bottleId', async (req, res) => {
  try {
    const userId = req.user!.id;
    const bottleId = req.params.bottleId;
    
    if (!bottleId) {
      res.status(400).json({
        success: false,
        error: '无效的漂流瓶ID'
      });
      return;
    }

    const [bottle, replies] = await Promise.all([
      PerformanceMonitor.monitorAsync(
        () => BottleService.getBottleById(bottleId),
        'miniapp_get_bottle_detail'
      ),
      PerformanceMonitor.monitorAsync(
        () => BottleService.getBottleReplies(bottleId),
        'miniapp_get_bottle_replies'
      )
    ]);

    if (!bottle) {
      res.status(404).json({
        success: false,
        error: '漂流瓶不存在或无权访问'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        bottle,
        replies
      }
    });
    
  } catch (error) {
    logger.error('获取漂流瓶详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取漂流瓶详情失败'
    });
  }
});

/**
 * 积分商店商品列表
 */
router.get('/shop/items', async (req, res) => {
  try {
    const category = req.query.category as string;
    
    const items = await PerformanceMonitor.monitorAsync(
      () => PointsService.getShopItems(category),
      'miniapp_shop_items'
    );

    res.json({
      success: true,
      data: items
    });
    
  } catch (error) {
    logger.error('获取商店商品失败:', error);
    res.status(500).json({
      success: false,
      error: '获取商店商品失败'
    });
  }
});

/**
 * 购买商品
 */
router.post('/shop/purchase', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { itemId } = req.body;
    
    if (!itemId) {
      res.status(400).json({
        success: false,
        error: '缺少商品ID'
      });
      return;
    }
    
    const result = await PerformanceMonitor.monitorAsync(
      () => PointsService.purchaseItem(userId, itemId),
      'miniapp_purchase_item'
    );

    res.json({
      success: true,
      data: result,
      message: '购买成功！'
    });
    
  } catch (error) {
    logger.error('购买商品失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '购买失败'
    });
  }
});

/**
 * 积分排行榜
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const type = req.query.type as string || 'points'; // 'points' | 'level' | 'bottles'
    
    const leaderboard = await PerformanceMonitor.monitorAsync(
      () => PointsService.getLeaderboard(limit),
      'miniapp_leaderboard'
    );

    res.json({
      success: true,
      data: {
        leaderboard,
        type,
        limit
      }
    });
    
  } catch (error) {
    logger.error('获取排行榜失败:', error);
    res.status(500).json({
      success: false,
      error: '获取排行榜失败'
    });
  }
});

/**
 * 签到
 */
router.post('/checkin', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const result = await PerformanceMonitor.monitorAsync(
      () => PointsService.dailyCheckin(userId),
      'miniapp_checkin'
    );

    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('签到失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '签到失败'
    });
  }
});

/**
 * 获取全局统计信息
 */
router.get('/stats/global', async (req, res) => {
  try {
    const stats = await PerformanceMonitor.monitorAsync(
      () => BottleService.getGlobalStats(),
      'miniapp_global_stats'
    );

    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    logger.error('获取全局统计失败:', error);
    res.status(500).json({
      success: false,
      error: '获取统计信息失败'
    });
  }
});

export default router; 