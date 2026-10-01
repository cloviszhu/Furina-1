# Proposal

## Why

现有 persona 只有 prompt 中的剧情与知情限制，没有可按来源、时间和拥有者筛选的知识存储。独立提供可审计的确定性 resolver，防止检索把未来事件、作者信息或用户说法变成芙宁娜的亲历。

## What Changes

- 新增版本化 4.2 小知识包，逐条记录 sourceStatus，未核实剧情保持 disabled/pending。
- 新增纯函数 resolver，先过滤 edition、事件时间、获知时间及 perspective，再按 topic/entity/alias 相关度排序和预算装包。
- 分离 canonicalfact、characterinterpretation、userinteraction；角色 modelPrompt 与互动 interactionPrompt 各自受字节/字符/记录预算限制，不挤占互动资料。仅显式相关匹配注入，空或短噪声零注入。
- 增加独立测试及来源/adapter 交接，生产入口保持现状。

## Capabilities

### New Capabilities

- `sourced-character-context`: 有来源、时间与知情边界的确定性角色知识检索。

### Modified Capabilities

无。

## Impact

只新增 server/character-context.js、版本化 data JSON、专属 tests/docs 与本 change。无依赖、embedding、模型调用、服务操作。集成由 owner 01a0f4a2 后续通过 adapter 负责。

## Non-goals

不补全全部人设、不修改现有人设/记忆/provider/index，不做体验质量或真实模型验收。
