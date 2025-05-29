#!/bin/bash

# 漂流瓶机器人启动脚本 (包含广播功能)
# 使用方法: ./scripts/start-with-broadcast.sh

echo "🌊 漂流瓶机器人启动脚本"
echo "=========================="

# 检查Node.js版本
echo "📋 检查环境..."
node_version=$(node -v)
echo "Node.js版本: $node_version"

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "❌ 未找到 .env 文件"
    echo "请复制 env.example 到 .env 并配置相关参数"
    exit 1
fi

echo "✅ 环境变量文件存在"

# 检查Bot Token
if ! grep -q "BOT_TOKEN=" .env || grep -q "BOT_TOKEN=your_bot_token_here" .env; then
    echo "❌ 请在 .env 文件中配置正确的 BOT_TOKEN"
    exit 1
fi

echo "✅ Bot Token已配置"

# 检查管理员用户ID
if ! grep -q "ADMIN_USER_IDS=" .env; then
    echo "⚠️  警告: 未配置 ADMIN_USER_IDS，广播管理功能将不可用"
    echo "请在 .env 文件中添加: ADMIN_USER_IDS=你的用户ID"
else
    echo "✅ 管理员用户ID已配置"
fi

# 构建项目
echo ""
echo "🔨 构建项目..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 构建失败"
    exit 1
fi

echo "✅ 构建成功"

# 测试广播功能
echo ""
echo "🧪 测试广播功能..."
node scripts/test-broadcast.js

if [ $? -ne 0 ]; then
    echo "❌ 广播功能测试失败"
    exit 1
fi

echo "✅ 广播功能测试通过"

# 启动机器人
echo ""
echo "🚀 启动机器人..."
echo "广播功能已启用，包含以下定时任务:"
echo "  • 每日活跃推广: 每天10点"
echo "  • 功能更新通知: 每周三15点"
echo "  • 周末活动推广: 每周五20点"
echo "  • 日志清理: 每天3点"
echo ""
echo "群组管理员命令:"
echo "  • /broadcast_on - 开启群组广播"
echo "  • /broadcast_off - 关闭群组广播"
echo ""
echo "超级管理员命令:"
echo "  • /admin_broadcast list - 查看广播模板"
echo "  • /admin_broadcast send <ID> - 执行广播"
echo "  • /admin_broadcast stats - 查看统计"
echo "  • /admin_broadcast groups - 查看群组"
echo ""
echo "按 Ctrl+C 停止机器人"
echo "=========================="

# 启动机器人
npm start 