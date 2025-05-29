#!/bin/bash

echo "🚀 开始设置Telegram防骗机器人..."

# 检查Node.js版本
if ! command -v node &> /dev/null; then
    echo "❌ 请先安装Node.js (版本 >= 18)"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js版本过低，请升级到18或更高版本"
    exit 1
fi

echo "✅ Node.js版本检查通过: $(node -v)"

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p data logs

# 安装依赖
echo "📦 安装依赖包..."
npm install

# 安装PM2（如果没有）
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装PM2进程管理器..."
    npm install -g pm2
fi

# 复制环境变量文件
if [ ! -f .env ]; then
    cp env.example .env
    echo "⚠️  请编辑 .env 文件，填入您的配置信息"
    echo "📝 主要需要配置的项目："
    echo "   - BOT_TOKEN: 您的Telegram Bot Token"
    echo "   - ADMIN_USER_IDS: 管理员用户ID"
    echo "   - OPENAI_API_KEY: OpenAI API密钥（可选）"
    echo "   - GOOGLE_SAFE_BROWSING_API_KEY: Google Safe Browsing API密钥（可选）"
else
    echo "✅ .env 文件已存在"
fi

# 构建项目
echo "🔨 构建项目..."
npm run build

echo ""
echo "✅ 设置完成！"
echo ""
echo "📋 下一步："
echo "1. 编辑 .env 文件，填入您的Bot Token和其他配置"
echo "2. 运行 npm run dev 开始开发"
echo "3. 或运行 npm run pm2:start 在生产环境启动"
echo ""
echo "🔧 常用命令："
echo "   npm run dev          - 开发模式（热重载）"
echo "   npm run build        - 构建项目"
echo "   npm start            - 生产模式运行"
echo "   npm run pm2:start    - PM2后台运行"
echo "   npm run pm2:logs     - 查看PM2日志"
echo "   npm run pm2:stop     - 停止PM2服务"
echo ""
echo "�� 更多信息请查看 README.md" 