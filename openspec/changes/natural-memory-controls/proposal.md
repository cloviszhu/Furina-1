# Proposal

## Why
成功回合形成的自动记忆需要用户管理入口，手动参考表达也必须保留且不破坏模型段落合同。

## What Changes
- 共同经历页面接自动列表、分页、来源、纠正、删除确认及失败恢复。
- 修改成功取消演出，刷新历史及手动/自动记录，跨页失效。
- manual参考表达使用独立字段，并以声音服务响应确认实际采用值。

## Capabilities
### New Capabilities
- `natural-memory-controls`: 用户管理自动记忆及相关兼容接线。
### Modified Capabilities
无。

## Impact
前端模块、main/speech、最小页面入口及隔离测试；遵循已确认合同，服务端逻辑和生产服务不改动。
