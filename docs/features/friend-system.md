# 👥 好友系统功能文档

本目录包含好友系统的完整文档。

## 相关文档

### 主要文档
- [好友功能更新](FRIEND_FEATURE_UPDATE.md) - 好友申请和私聊功能实现
- [好友显示优化](FRIEND_DISPLAY_OPTIMIZATION.md) - 用户显示名称优化

### 功能概述

好友系统让用户可以在匿名交流的基础上建立真实的好友关系：

#### 核心特性
- **智能申请**: 聊天互动达到条件后自动显示申请按钮
- **隐私保护**: 申请阶段保持匿名，成为好友后显示友好名称
- **私聊跳转**: 一键跳转到 Telegram 私聊
- **好友管理**: 完整的好友列表和管理功能

#### 技术实现
- **数据库设计**: friendships 和 friend_requests 表
- **用户信息**: UserService 管理友好显示名称
- **安全机制**: 防重复申请和权限检查
- **通知系统**: 实时的申请和状态通知

#### 使用流程
1. 匿名聊天互动达到阈值
2. 显示好友申请按钮
3. 对方接受/拒绝申请
4. 成为好友，支持私聊跳转

---

📅 **功能版本**: v2.1
🔗 **相关模块**: 用户管理、通知系统、聊天功能 