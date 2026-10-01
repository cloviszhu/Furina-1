# Proposal

## Why

当前 12 条小包只能证明检索底座，缺少枫丹五幕主要出场、角色关系与个人任务因果链。用户明确要求外部来源导入和丰满人设，需要以可核验事件摘要替代零散标签偏好。

## What Changes

- 新版本 pack 保留旧包，逐场景导入自行中文改写，区分本人经历、公开姿态、私下感受、转述和作者视角。
- 新增按 Act I–V/个人任务三段/角色故事的 coverage 与 source ledger，记录精确 section/asset ID、版次、事件及获知时间、许可署名和未覆盖项。
- 默认 resolver 只切换数据导入；保持 query、timeline、UTF-8 与独立 interactionmemory 预算。
- 回归验证关系/事件检索多样性、矛盾修正、未来及未知机制隔离。

## Capabilities

### New Capabilities
- `furina-story-coverage`: 来源化角色资料及枫丹主要场景因果链的有界导入。

### Modified Capabilities
无。

## Impact

新 data JSON、专属 tests/docs/OpenSpec，resolver 仅一行 import 切换。不改 provider/index/前端，不操作生产或真实数据。

## Non-goals

不下载整库、不复制长对白、不宣称详细剧情全部覆盖或全 primary、不导入 4.2 后事件，不生成恋爱、诊断或玩家与当前用户共同经历。
