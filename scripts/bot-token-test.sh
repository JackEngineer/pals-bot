#!/bin/bash

echo "🤖 Telegram Bot Token 验证"
echo "=========================="

# 检查.env文件是否存在
if [ ! -f .env ]; then
    echo "❌ .env 文件不存在"
    echo "请先复制 env.example 到 .env 并配置Bot Token"
    exit 1
fi

# 读取Bot Token
BOT_TOKEN=$(grep "^BOT_TOKEN=" .env | cut -d'=' -f2)

if [ -z "$BOT_TOKEN" ] || [ "$BOT_TOKEN" = "your_bot_token_here" ]; then
    echo "❌ Bot Token 未配置"
    echo ""
    echo "📝 获取Bot Token的步骤："
    echo "1. 在Telegram中搜索 @BotFather"
    echo "2. 发送 /newbot 创建新机器人"
    echo "3. 按提示设置机器人名称和用户名"
    echo "4. 复制获得的Token到 .env 文件中"
    echo ""
    echo "Token格式示例: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
    exit 1
fi

echo "✅ 找到Bot Token: ${BOT_TOKEN:0:10}..."

# 测试Bot Token
echo ""
echo "🔍 测试Bot Token..."

# 使用代理测试
PROXY_URL=$(grep "^PROXY_URL=" .env | cut -d'=' -f2)
if [ ! -z "$PROXY_URL" ]; then
    echo "使用代理: $PROXY_URL"
    RESPONSE=$(curl --proxy "$PROXY_URL" -s "https://api.telegram.org/bot$BOT_TOKEN/getMe")
else
    echo "直接连接（无代理）"
    RESPONSE=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/getMe")
fi

if echo "$RESPONSE" | grep -q '"ok":true'; then
    BOT_NAME=$(echo "$RESPONSE" | grep -o '"first_name":"[^"]*"' | cut -d'"' -f4)
    BOT_USERNAME=$(echo "$RESPONSE" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Bot Token 有效！"
    echo "🤖 机器人名称: $BOT_NAME"
    echo "📝 用户名: @$BOT_USERNAME"
else
    echo "❌ Bot Token 无效或网络连接失败"
    echo "响应: $RESPONSE"
    echo ""
    echo "可能的原因："
    echo "1. Bot Token 错误"
    echo "2. 网络连接问题"
    echo "3. 代理配置错误"
fi 