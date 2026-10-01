# Design

## Context
接口已由edd8b5e明确，见docs/interaction-memory-api-contract.md。自动与手动记忆在共同经历tab分别显示。

## Goals / Non-Goals
目标：用户可查看、纠正、删除自动episode，正确取消演出并刷新多处来源。不改服务端逻辑或自动提取策略，不部署。

## Decisions
内部呈现adapter映射GET items，key取eventId，limit50/offset分页，hasMore触发加载更多。PATCH/DELETE使用eventId。created/updated来源字段用来显示时间、修订和类型。onBeforeMutation停止旧对话，成功后onMutation停止可能新开的演出、广播失效并刷新历史/手动记录，再加载自动列表。retained:false告知来源已移除。
generation和AbortController拒绝旧snapshot与不同角色上下文结果；pagehide dispose。正文使用textContent。
manual表达保持segment emotion，另发独立referenceEmotion；以WAV头X-Exo-Emotion及X-Exo-Expression-Mode确认实际值。缺失/不一致拒播，注册不支持明确失败，舞台只在audio start采用确认表达。既有试听无turn路径保持兼容。

## Risks / Trade-offs
分页期间记录变化 → 重复key拒绝并要求重新载入。
修订成功后刷新失败 → 不重复写入，展示刷新失败供重新载入。
假音频通过 → 不证明角色声线及人类感知，统一验收单独记录。

## Migration Plan
提交前端增量给集成owner。其已有edd8b5e服务端及244cddd呈现模块后，只合入本次末尾增量。生产发布由父线程另行决定。
