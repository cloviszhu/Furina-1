# Proposal

## Why

前两阶段已具备本地舞台、记忆与真实 TTS，但独立 QA 修复尚未合入，表达切换与角色时点缺少完整旅程证据。第三阶段在现有结构上补齐可靠互动与可解释的故障状态。

## What Changes

- 集成记忆 generation 修复，验证纠改/删除期间迟到回复不会显示、朗读或重新持久化。
- 增加可配置剧情时点与语言风格，区分官方背景、玩家确认记录及主观解释。
- 增加独立结构化表达契约，provider 替身验证正文与 emotion 分离；纯文本回复降级为 neutral。
- 表达/声线/语速变更立即取消旧语音，新回复使用一致的当前选择；增加舞台表情与真实截图证据。
- 补齐服务断开、缺资产、缺 reference/声音的修复提示，审查 loopback、秘密与预算拒绝路径。

## Capabilities

### New Capabilities

- `interaction-quality`: 可配置角色边界、结构化表达与完整用户旅程质量。

### Modified Capabilities

无主规格；现有未归档阶段的记忆/对话/TTS 约束继续适用，不重复建立同名规格。

## Impact

涉及 server/provider/persona、前端舞台/声音/设置、测试及交接。不增加权重或依赖，不调用真实付费模型，不读取凭证。用户已明确授权自主实施与 stage push；规划技能默认停顿不覆盖该授权。
