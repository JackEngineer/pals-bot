# 🌊 漂流瓶机器人快速启动指南

## 1. 配置环境变量

```bash
cp env.example .env
```

编辑 `.env` 文件，至少需要配置：
- `BOT_TOKEN`: 从 @BotFather 获取的机器人Token

## 2. 安装依赖

```bash
npm install
```

## 3. 启动机器人

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## 4. 测试机器人

在Telegram中找到你的机器人，发送 `/start` 开始使用！

## 主要功能

- 📝 `/throw <内容>` - 投放漂流瓶
- 🎣 `/pick` - 捡拾漂流瓶  
- 💬 `/reply <瓶子ID> <回复>` - 回复漂流瓶
- 📊 `/stats` - 查看个人统计
- 🌊 `/global` - 查看全局统计

## 注意事项

- 每天最多投放10个漂流瓶
- 不能捡拾自己投放的漂流瓶
- 支持文字、图片、语音、视频等多种类型 