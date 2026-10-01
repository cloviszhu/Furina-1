# Proposal

## Why

现有明确确认记忆是底座，不能承担互动自然形成的长期记忆。新增有用户原话归属的离线 episode 存储和有据检索，避免历史窗口淘汰后失去来源，避免把计划、角色台词或推断写为真实经历。

## What Changes

- 新增独立互动记忆模块，自动接收成功用户回合；持久化原话、确定子集 claim 和倒排索引。
- 提供预算受限的跨长期 episode 检索，保留时间、类型、来源和冲突状态。
- 支持更正、删除派生失效，秘密拒存、测试/虚构/假设隔离及容量上限。
- 只读复用明确确认记忆，不覆写已有事实；接线由集成 owner 完成。

## Capabilities

### New Capabilities
- `interaction-memory`: 从成功互动自然保留可核验用户来源，筛选与召回。

### Modified Capabilities

无；当前尚无归档主规格。

## Impact

仅新建 server/interaction-memory.js、模块 tests、独立 change 与交接文档。使用 node:sqlite，无新依赖、外部模型或 embedding。不会修改路由、provider、旧 MemoryStore 或前端。
