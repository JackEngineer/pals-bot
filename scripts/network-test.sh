#!/bin/bash

echo "🌐 Telegram API 网络连接测试"
echo "================================"

# 测试基本网络连接
echo "1. 测试基本网络连接..."
if ping -c 3 8.8.8.8 > /dev/null 2>&1; then
    echo "✅ 基本网络连接正常"
else
    echo "❌ 基本网络连接失败"
    exit 1
fi

# 测试DNS解析
echo ""
echo "2. 测试DNS解析..."
if nslookup api.telegram.org > /dev/null 2>&1; then
    echo "✅ DNS解析正常"
    nslookup api.telegram.org | grep "Address:" | tail -1
else
    echo "❌ DNS解析失败"
fi

# 测试Telegram API连接
echo ""
echo "3. 测试Telegram API连接..."
if curl -m 10 -s https://api.telegram.org > /dev/null 2>&1; then
    echo "✅ 可以直接访问Telegram API"
    echo "🎉 无需配置代理，可以直接使用机器人"
else
    echo "❌ 无法访问Telegram API"
    echo ""
    echo "🔧 解决方案："
    echo "1. 使用VPN或代理服务"
    echo "2. 配置代理到 .env 文件："
    echo "   PROXY_URL=socks5://127.0.0.1:1080"
    echo "   或"
    echo "   PROXY_URL=http://127.0.0.1:8080"
    echo ""
    echo "3. 常见代理软件："
    echo "   - Clash: socks5://127.0.0.1:7890"
    echo "   - V2Ray: socks5://127.0.0.1:1080"
    echo "   - Shadowsocks: socks5://127.0.0.1:1080"
fi

# 测试常见代理端口
echo ""
echo "4. 检测本地代理服务..."
common_ports=(1080 7890 8080 8118 1087)
for port in "${common_ports[@]}"; do
    if nc -z 127.0.0.1 $port 2>/dev/null; then
        echo "✅ 检测到本地代理服务: 127.0.0.1:$port"
        echo "   可以尝试配置: PROXY_URL=socks5://127.0.0.1:$port"
    fi
done

echo ""
echo "================================"
echo "💡 如果无法直接访问，请："
echo "1. 启动VPN或代理软件"
echo "2. 在 .env 文件中配置 PROXY_URL"
echo "3. 重新启动机器人" 