#!/bin/bash

echo "🚀 启动Telegram防骗机器人..."

# 检查环境变量
if [ ! -f .env ]; then
    echo "❌ 请先创建 .env 文件"
    echo "💡 运行 ./scripts/setup.sh 进行初始化设置"
    exit 1
fi

# 检查Bot Token
if ! grep -q "BOT_TOKEN=" .env || grep -q "BOT_TOKEN=your_bot_token_here" .env; then
    echo "❌ 请在 .env 文件中设置正确的 BOT_TOKEN"
    echo "📝 获取Bot Token的步骤："
    echo "   1. 在Telegram中搜索 @BotFather"
    echo "   2. 发送 /newbot 创建新机器人"
    echo "   3. 按提示设置机器人名称和用户名"
    echo "   4. 复制获得的Token到 .env 文件中"
    exit 1
fi

# 构建项目
echo "🔨 构建项目..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 项目构建失败"
    exit 1
fi

# 启动服务
if [ "$1" = "dev" ]; then
    echo "🔧 开发模式启动..."
    npm run dev
elif [ "$1" = "pm2" ]; then
    echo "🔄 PM2模式启动..."
    npm run pm2:start
    echo "📊 查看运行状态："
    pm2 status
    echo ""
    echo "📋 常用PM2命令："
    echo "   pm2 logs pals-bot     - 查看日志"
    echo "   pm2 restart pals-bot  - 重启服务"
    echo "   pm2 stop pals-bot     - 停止服务"
    echo "   pm2 monit           - 监控面板"
elif [ "$1" = "docker" ]; then
    echo "🐳 Docker模式启动..."
    if [ ! -f Dockerfile ]; then
        echo "❌ 未找到Dockerfile"
        exit 1
    fi
    docker build -t pals-bot .
    docker run -d --name pals-bot --env-file .env -p 3001:3001 pals-bot
else
    echo "🎯 生产模式启动..."
    npm start
fi 