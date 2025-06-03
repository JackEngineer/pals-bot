# 漂流瓶 Vue Mini App

## 🎯 项目概述

这是漂流瓶Telegram机器人的Vue.js前端应用，已完全从原生JavaScript迁移到Vue 3 + TypeScript + Vite架构。

## 🏗️ 技术栈

- **Vue 3** - 渐进式JavaScript框架
- **TypeScript** - 类型安全的JavaScript超集
- **Vite** - 现代化构建工具
- **Vue Router** - 官方路由管理器
- **Pinia** - 状态管理库
- **Telegram Web App API** - Telegram小程序接口

## 📁 项目结构

```
src/webapp/
├── src/
│   ├── components/          # Vue组件
│   │   ├── AppHeader.vue    # 应用头部
│   │   ├── BottomNav.vue    # 底部导航
│   │   ├── ThrowBottleModal.vue     # 投放漂流瓶弹窗
│   │   └── PickedBottleModal.vue    # 捡拾漂流瓶弹窗
│   ├── views/               # 页面视图
│   │   ├── Home.vue         # 首页
│   │   ├── Bottles.vue      # 漂流瓶页面
│   │   ├── Shop.vue         # 商店页面
│   │   ├── Profile.vue      # 个人中心
│   │   └── BottleDetail.vue # 漂流瓶详情
│   ├── stores/              # Pinia状态管理
│   │   └── user.ts          # 用户状态
│   ├── utils/               # 工具函数
│   │   └── api.ts           # API请求封装
│   ├── styles/              # 样式文件
│   │   └── global.css       # 全局样式
│   ├── router/              # 路由配置
│   │   └── index.ts         # 路由定义
│   ├── App.vue              # 根组件
│   └── main.ts              # 应用入口
├── public/                  # 静态资源（构建输出）
├── dist/                    # 构建输出目录
├── package.json             # 项目配置
├── vite.config.ts           # Vite配置
├── tsconfig.json            # TypeScript配置
├── env.d.ts                 # 环境类型声明
└── build-and-deploy.sh      # 自动化构建脚本
```

## 🚀 开发指南

### 安装依赖
```bash
cd src/webapp
npm install
```

### 开发模式
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 自动化构建和部署
```bash
./build-and-deploy.sh
```

## 🔧 核心功能

### 已实现功能
- ✅ Vue 3 + TypeScript 架构
- ✅ 响应式设计和Telegram主题适配
- ✅ 用户状态管理（Pinia）
- ✅ 路由管理（Vue Router）
- ✅ API请求封装
- ✅ 首页统计展示
- ✅ 投放漂流瓶功能
- ✅ 捡拾漂流瓶功能
- ✅ 每日签到功能
- ✅ 模态框组件

### 待扩展功能
- 🔄 漂流瓶列表页面
- 🔄 积分商店页面
- 🔄 个人中心页面
- 🔄 漂流瓶详情页面
- 🔄 消息通知组件
- 🔄 加载状态优化

## 📱 Telegram集成

应用已完全集成Telegram Web App API：
- 自动初始化和展开
- 主题色彩适配
- 用户身份验证
- 触觉反馈支持

## 🎨 设计特色

- **现代化UI**: 使用Telegram官方设计语言
- **响应式布局**: 适配各种屏幕尺寸
- **流畅动画**: CSS过渡和Vue动画
- **无障碍设计**: 支持键盘导航和屏幕阅读器

## 🔄 迁移说明

### 从原生JavaScript迁移完成
- ✅ 完全重写为Vue 3组件化架构
- ✅ TypeScript类型安全
- ✅ 现代化构建工具链
- ✅ 状态管理优化
- ✅ 代码组织和可维护性提升

### API兼容性
- 保持与现有后端API完全兼容
- 支持Telegram initData验证
- 错误处理和重试机制

## 📝 开发规范

### 组件开发
- 使用Vue 3 Composition API
- TypeScript严格模式
- 单文件组件（SFC）格式
- Props和Emits类型声明

### 状态管理
- Pinia stores用于全局状态
- 响应式数据绑定
- 异步操作处理

### 样式规范
- CSS变量支持主题切换
- 移动端优先设计
- 组件样式隔离

## 🚀 部署说明

1. 运行构建脚本：`./build-and-deploy.sh`
2. 构建产物自动部署到 `../public/` 目录
3. 原有文件自动备份
4. 支持热更新和版本回滚

## 🔮 未来规划

- 添加更多交互动画
- 实现离线缓存
- 性能监控和优化
- 国际化支持
- PWA功能 