# Proposal

## Why
自动形成记忆必须让用户能够查看、纠正和删除。接口合同尚未确定，先准备独立呈现与操作状态，避免猜接口。

## What Changes
- 自动记忆卡片、来源、纠正草稿与显式提交、删除确认。
- 失败恢复、操作锁、迟到刷新拒绝及离开页面取消。
- 由已确认合同的适配器注入列表、修订与删除，当前不接正式页面。

## Capabilities
### New Capabilities
- `natural-memory-controls`: 用户管理自动记忆。
### Modified Capabilities
无。

## Impact
前端独立模块和隔离测试；服务端、生产服务及既有手动记忆不修改。
