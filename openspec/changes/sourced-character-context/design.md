# Design

## Context

现有 server/persona.js 提供 aftermath/performer 文本约束；无 canonstore。现有 change 处理互动记忆和连续表达，文件所有权与本模块分开。此 worktree 只写新文件，后续集成由 owner 01a0f4a2 负责。

## Goals / Non-Goals

**Goals:** 可复现、来源透明、严格 4.2 edition、检索前过滤、总记录/字符预算、三类知识隔离。

**Non-Goals:** 不接生产入口，不改原有 persona 事实，不使用 D_sakiko 代码，不声称知识库完善。

## Decisions

- 使用 schemaVersion=1 的 JSON，packVersion 独立版本号，canonEdition 精确匹配 4.2。eventAt 与 knowledge 的 knownFrom 使用固定剧情阶段序数；publication 不参与剧情比较，避免把后来页面更新误作后来事件。
- reference-transcript-checked 表示已检查参考转写；official_hosted_game_text 表示研究员浏览器实读官方托管游戏文本；secondary_game_dialogue_transcription 表示已实际读取的二手任务对话转写。三者都不等于 direct-game primary，亦不因域名推导官方作者。只有合格来源可启用；pending/secondary-only 不可进入上下文。宣传只能是 author 的 interpretation。
- 每条 knowledge 指定 owner、knownFrom、basis 及可选 mode。experienced/eyewitness/self-report/reported/author 区分本人经历、目睹、自述、获知转述和叙事视角；缺 mode 用 unspecified，不推导亲历。reported 必须带独立合格 sourceStatus/sourceRefs，pending learning 不授予知情。public/private 都需要当前角色获知证据，不从公开性或作者视角推导知情。Finale 的完整如实转述支持 aftermath 获知，不能硬编码永远不知计划。
- 默认小包不可由 userinteraction 改写。交互只接显式 typed 的 userfact/plan/characterspeculation，保留 speaker 与不同语义；无自然语言事实识别。
- 工厂校验并复制冻结 pack；纯函数不读写磁盘、不看当前时间、不调用模型。默认通过 JSON import 加载固定包，无新依赖。
- 先 eligibility 再显式相关性：query 只匹配完整标签、英文边界，不反向匹配局部词；topic/entity 提示精确匹配。至少连续 2 汉字或 3 ASCII 字母/数字；空输入、短噪声、无关闲聊零注入。canon 文本只作完整文本精确匹配，互动文本可以完整 query 子串匹配。按命中向量再 kind:id 排序。
- 整条 JSON 行输出，UTF-16 maxChars 与实际 UTF-8 maxBytes 同时检查，包括头/标签/换行。canon/interpretation 的 modelPrompt 与 userinteraction 的 interactionPrompt 独立预算，互不挤占。默认每区 8 条/4000 chars/2048 bytes，硬限 12/6000/4096。不是 token 计数器。adapter 必须先保留真实 interactionmemory 配额，再以剩余预算决定 canon 注入；不自动合并两个投影。

## Risks / Trade-offs

- 官方网页动态/空壳、搜索索引转写没有不可变旧版快照 → sourceStatus 如实标记，有限参考启用不冒称 primary；新剧情仍 pending。
- 二手任务转写不等于 direct-game primary → 保留具体 task/voice asset locator、来源资格及本人获知方式；fixture 仍不算真实来源覆盖。
- 无游戏时钟的語音采用保守编辑映射 → 不宣称是精确剧情日期；新增证据可收紧 knownFrom。
- 用户文本仍是模型可见的不可信内容 → JSON 标签只提供语义隔离，adapter 必须放在数据区，不把用户字段当系统指令。

## Migration Plan

本阶段只有独立提交，不合并/推送/部署。adapter 必须分别处理 modelPrompt 与 interactionPrompt，在真实模型验收前复核来源资格/版次并预留互动记忆预算。
