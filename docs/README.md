# pals-bot 项目文档索引

## 📁 文档目录结构

```
docs/
├── features/     # 功能开发文档
├── fixes/        # 修复记录文档  
├── guides/       # 使用指南文档
├── summaries/    # 项目总结文档
├── tests/        # 测试相关文档
└── README.md     # 本文档索引
```

## 📋 功能开发文档 (features/)

| 文档名称 | 描述 | 状态 |
|---------|------|------|
| `REPUTATION_RESTORATION_FEATURE.md` | 信誉恢复功能设计 | ✅ 已实现 |
| `SCAMMER_APPEAL_BUTTONS_FEATURE.md` | 骗子申诉按钮功能 | ✅ 已实现 |
| `ENHANCED_REPORT_SYSTEM.md` | 增强举报系统 | ✅ 已实现 |
| `BLACKLIST_APPEAL_SYSTEM.md` | 黑名单申诉系统 | ✅ 已实现 |
| `DETECTION_CONFIG.md` | 检测配置功能 | ✅ 已实现 |

## 🔧 修复记录文档 (fixes/)

| 文档名称 | 描述 | 修复版本 |
|---------|------|----------|
| `APPEAL_DEADLOOP_FINAL_FIX.md` | 申诉死循环最终修复 | v2.x |
| `DATABASE_LOCK_FIX_SUMMARY.md` | 数据库锁定问题修复 | v2.x |
| `BROADCAST_FIX_SUMMARY.md` | 广播功能修复总结 | v2.x |
| `BUTTON_MESSAGE_EDIT_FIX.md` | 按钮消息编辑修复 | v2.x |
| `MESSAGE_EDIT_IMPROVEMENT.md` | 消息编辑改进 | v2.x |
| `APPEAL_NOTIFICATION_FIX.md` | 申诉通知修复 | v2.x |

## 📖 使用指南文档 (guides/)

| 文档名称 | 描述 | 目标用户 |
|---------|------|----------|
| `QUICK_APPEAL_REVIEW_GUIDE.md` | 快速申诉审核指南 | 管理员 |
| `PRIVATE_CHAT_APPEAL_GUIDE.md` | 私聊申诉指南 | 用户 |

## 📊 项目总结文档 (summaries/)

| 文档名称 | 描述 | 更新时间 |
|---------|------|----------|
| `REFACTORING_SUMMARY.md` | 代码重构总结 | 最新 |
| `IMPLEMENTATION_SUMMARY.md` | 实现总结 | 最新 |
| `SCAMMER_MANAGEMENT.md` | 骗子管理系统总结 | 最新 |

## 🧪 测试相关文档 (tests/)

| 文档名称 | 描述 | 测试状态 |
|---------|------|----------|
| `test_appeal_fix.md` | 申诉修复测试 | ✅ 通过 |
| `test_appeal_deadloop_fix.md` | 申诉死循环修复测试 | ✅ 通过 |
| `test_group_warning.md` | 群组警告测试 | ✅ 通过 |
| `test_appeal.md` | 申诉功能测试 | ✅ 通过 |

## 📝 文档管理规范

### 新建文档规则
1. **功能开发**: 新功能设计和实现文档放入 `features/`
2. **问题修复**: Bug修复和改进文档放入 `fixes/`
3. **使用指南**: 用户和管理员指南放入 `guides/`
4. **项目总结**: 阶段性总结和架构文档放入 `summaries/`
5. **测试记录**: 测试用例和测试报告放入 `tests/`

### 文档命名规范
- 使用英文大写和下划线: `FEATURE_NAME.md`
- 测试文档使用小写: `test_feature_name.md`
- 修复文档包含 `FIX` 关键词: `ISSUE_FIX.md`

### 文档内容要求
- 包含创建日期和最后更新时间
- 明确的问题描述和解决方案
- 相关代码文件引用
- 测试验证步骤

## 🗂️ 文档清理建议

### 定期清理 (每月)
1. 检查 `tests/` 目录中的过时测试文档
2. 合并相似的修复文档
3. 更新文档索引表格
4. 归档已完成的功能文档

### 文档归档
- 超过6个月的测试文档可以移动到 `docs/archive/`
- 已废弃的功能文档标记为 `[DEPRECATED]`
- 重要的历史文档保留在对应目录

## 🔍 快速查找

### 按问题类型查找
- **申诉相关**: 搜索包含 `APPEAL` 的文档
- **按钮问题**: 搜索包含 `BUTTON` 的文档  
- **数据库问题**: 搜索包含 `DATABASE` 的文档
- **通知问题**: 搜索包含 `NOTIFICATION` 的文档

### 按功能模块查找
- **用户管理**: `SCAMMER_MANAGEMENT.md`, `BLACKLIST_APPEAL_SYSTEM.md`
- **检测系统**: `DETECTION_CONFIG.md`, `ENHANCED_REPORT_SYSTEM.md`
- **消息处理**: `MESSAGE_EDIT_IMPROVEMENT.md`, `BROADCAST_FIX_SUMMARY.md`

---

📅 **最后更新**: 2024年12月
👤 **维护者**: pals-bot 开发团队 