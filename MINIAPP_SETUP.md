# 漂流瓶 Mini App 设置指南

## 🎯 概述

本项目现已支持 Telegram Mini App 功能，用户可以通过内置的 Web 应用享受更丰富的交互体验。

## 🚀 功能特性

### Mini App 核心功能
- 📱 响应式设计，适配各种屏幕尺寸
- 🎨 支持 Telegram 原生主题切换
- 🔐 基于 Telegram Web App API 的安全认证
- ⚡ 实时数据同步和状态管理

### 用户功能
- 🏠 **首页**: 快速查看统计信息和执行操作
- 🍾 **漂流瓶管理**: 查看投放和捡拾的漂流瓶
- 🛒 **积分商店**: 浏览和购买虚拟商品
- 👤 **个人中心**: 详细的用户信息和统计

### 交互功能
- 📝 投放漂流瓶
- 🎣 捡拾漂流瓶
- 💬 回复漂流瓶
- 📅 每日签到
- 💰 积分系统集成

## ⚙️ 环境配置

### 1. 环境变量设置

在 `.env` 文件中添加以下配置：

```bash
# Mini App配置
WEBAPP_URL=https://your-domain.com
MINI_APP_SECRET=your_mini_app_secret_key
```

### 2. Telegram Bot 设置

1. 与 @BotFather 对话
2. 使用 `/setmenubutton` 命令
3. 选择你的机器人
4. 设置菜单按钮链接：`https://your-domain.com/app`

### 3. 域名和HTTPS

⚠️ **重要**: Mini App 必须通过 HTTPS 访问，确保：
- 域名有有效的 SSL 证书
- 服务器支持 HTTPS 协议
- 防火墙允许 443 端口

## 🛠️ 部署步骤

### 方法1: 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp env.example .env
# 编辑 .env 文件设置你的配置

# 3. 构建项目
npm run build:all

# 4. 启动服务器
npm start
```

### 方法2: PM2 生产部署

```bash
# 1. 构建并启动
npm run pm2:start

# 2. 查看状态
npm run pm2:logs
```

## 📋 API 接口

### 认证机制
所有 API 请求都需要包含 Telegram initData 进行身份验证。

### 核心端点

```
GET  /api/miniapp/user/profile     - 获取用户信息
GET  /api/miniapp/bottles          - 获取漂流瓶列表
POST /api/miniapp/bottles/throw    - 投放漂流瓶
POST /api/miniapp/bottles/pick     - 捡拾漂流瓶
POST /api/miniapp/bottles/:id/reply - 回复漂流瓶
GET  /api/miniapp/shop/items       - 获取商店商品
POST /api/miniapp/shop/purchase    - 购买商品
POST /api/miniapp/checkin          - 每日签到
GET  /api/miniapp/leaderboard      - 积分排行榜
```

## 🔧 技术架构

### 后端技术栈
- **Express.js**: Web 服务器框架
- **TypeScript**: 类型安全的开发体验
- **SQLite**: 轻量级数据库
- **Helmet**: 安全标头中间件
- **CORS**: 跨域资源共享支持

### 前端技术栈
- **原生 JavaScript**: 轻量级，无需额外框架
- **Telegram Web App API**: 与 Telegram 客户端深度集成
- **CSS Variables**: 支持动态主题切换
- **Responsive Design**: 适配各种设备尺寸

### 安全特性
- ✅ Telegram initData 验证
- ✅ HTTPS 强制要求
- ✅ CSP 安全策略
- ✅ 防 XSS 和 CSRF 攻击
- ✅ 输入验证和数据清理

## 🎨 界面定制

### 主题支持
Mini App 会自动适应用户的 Telegram 主题设置：
- 🌞 浅色主题
- 🌙 深色主题
- 🎨 自定义颜色方案

### CSS 变量
使用 Telegram 的 CSS 变量实现主题一致性：
```css
var(--tg-theme-bg-color)
var(--tg-theme-text-color)
var(--tg-theme-button-color)
var(--tg-theme-secondary-bg-color)
```

## 📱 用户体验

### 启动方式
1. **Bot 命令**: `/app` - 显示 Mini App 启动按钮
2. **菜单按钮**: 点击聊天界面的菜单按钮
3. **内联按钮**: 在各种机器人回复中的快捷按钮

### 性能优化
- 🚀 懒加载和按需渲染
- 💾 本地状态缓存
- ⚡ API 请求优化
- 📱 移动端优先设计

## 🔍 调试和监控

### 开发调试
```bash
# 启用开发模式
NODE_ENV=development npm run dev

# 查看详细日志
tail -f logs/combined.log
```

### 生产监控
```bash
# 查看应用状态
pm2 status

# 查看性能指标
curl http://localhost:3001/metrics

# 健康检查
curl http://localhost:3001/health
```

## 🐛 常见问题

### Q: Mini App 无法加载？
A: 检查以下项目：
1. WEBAPP_URL 是否正确配置
2. 域名是否支持 HTTPS
3. Bot Token 是否有效
4. 防火墙设置是否正确

### Q: 认证失败？
A: 确认：
1. initData 是否正确传递
2. BOT_TOKEN 环境变量是否设置
3. 服务器时间是否准确

### Q: 功能按钮无响应？
A: 检查：
1. JavaScript 控制台是否有错误
2. API 端点是否可访问
3. 网络连接是否稳定

## 📞 技术支持

如果遇到问题，请：
1. 查看日志文件：`logs/combined.log`
2. 检查系统状态：`/health` 端点
3. 验证 API 响应：`/api/miniapp/user/profile`

## 🔮 未来计划

- [ ] PWA 支持
- [ ] 离线功能
- [ ] 推送通知
- [ ] 多语言支持
- [ ] 更多主题选项
- [ ] 高级数据可视化

---

**享受你的漂流瓶 Mini App 体验！** 🌊✨ 