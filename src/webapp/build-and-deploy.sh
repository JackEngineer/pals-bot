#!/bin/bash

# Vue应用构建和部署脚本
echo "🚀 开始构建Vue应用..."

# 构建Vue应用
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Vue应用构建成功"
    
    # 备份原有文件
    if [ -f "../public/index.html" ]; then
        echo "📦 备份原有文件..."
        mv ../public/index.html ../public/index.html.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    # 清理public目录中的旧文件（保留备份）
    echo "🧹 清理旧文件..."
    find ../public -name "*.js" -delete
    find ../public -name "*.css" -delete
    find ../public -name "*.html" ! -name "*.backup.*" -delete
    
    # 复制新构建的文件
    echo "📋 部署新文件..."
    cp -r dist/* ../public/
    
    echo "🎉 Vue应用部署完成！"
    echo "📁 文件已部署到: $(pwd)/../public/"
    
else
    echo "❌ Vue应用构建失败"
    exit 1
fi 