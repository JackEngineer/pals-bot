# 🚀 快速开始指南

本指南帮助您快速部署和使用漂流瓶机器人。

## 相关文档

### 主要文档
- [项目 README](../../README.md) - 详细的功能介绍
- [快速启动指南](../../SETUP.md) - 简化的部署步骤

## 快速部署

### 1. 环境准备
```bash
# 确保安装了 Node.js 18+
node --version

# 克隆项目
git clone <repository-url>
cd pals-bot
```

### 2. 配置环境
```bash
# 复制环境变量模板
cp env.example .env

# 编辑配置文件，填入 Bot Token
vim .env
```

### 3. 安装和启动
```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 启动机器人
npm start
```

## 主要功能

### 用户功能
- 📝 **投放漂流瓶**: `/throw <内容>`
- 🎣 **捡拾漂流瓶**: `/pick`
- 💬 **回复漂流瓶**: 点击按钮回复
- 💰 **积分系统**: `/points` 查看积分
- 👥 **好友功能**: `/friends` 管理好友

### 管理功能
- 📢 **群组广播**: `/broadcast_on/off`
- 👑 **超级管理**: `/admin_broadcast` 系列命令
- 📊 **统计查看**: `/stats`、`/global`

## 功能模块

### 核心系统
1. **漂流瓶系统** - 主要的社交功能
2. **积分系统** - 游戏化激励机制
3. **好友系统** - 深度社交功能
4. **广播系统** - 群组推广功能

### 文档索引
- **功能文档**: [features/](../features/) 目录
- **修复记录**: [fixes/](../fixes/) 目录
- **使用指南**: [guides/](../guides/) 目录
- **项目总结**: [summaries/](../summaries/) 目录

## 常见问题

### 部署相关
- **Q**: Bot Token 如何获取？
- **A**: 联系 @BotFather 创建机器人获取 Token

- **Q**: 数据库需要手动创建吗？
- **A**: 不需要，SQLite 数据库会自动初始化

### 功能相关
- **Q**: 如何开启群组广播？
- **A**: 群组管理员发送 `/broadcast_on` 命令

- **Q**: 积分如何获得？
- **A**: 投放、捡拾、回复漂流瓶以及每日签到都可获得积分

## 技术支持

如需更多帮助，请查看：
- [项目文档索引](../README.md)
- [积分系统说明](../points-system.md)
- [功能开发文档](../features/)

---

📅 **更新时间**: 2024年12月
🔗 **相关链接**: [项目 GitHub](https://github.com/your-repo/pals-bot) 