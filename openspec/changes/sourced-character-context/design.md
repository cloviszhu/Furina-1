# Design

## Context

现有 server/persona.js 提供 aftermath/performer 文本约束；无 canonstore。现有 change 处理互动记忆和连续表达，文件所有权与本模块分开。此 worktree 只写新文件，后续集成由 owner 01a0f4a2 负责。

## Goals / Non-Goals

**Goals:** 可复现、来源透明、严格 4.2 edition、检索前过滤、总记录/字符预算、三类知识隔离。

**Non-Goals:** 不接生产入口，不改原有 persona 事实，不使用 D_sakiko 代码，不声称知识库完善。

## Decisions

- 使用 schemaVersion=1 的 JSON，packVersion 独立版本号，canonEdition 精确匹配 4.2。eventAt 与 knowledge 的 knownFrom 使用固定剧情阶段序数；publication 不参与剧情比较，避免把后来页面更新误作后来事件。
- sourceStatus=reference-transcript-checked 明确表示已检查官方托管的角色语音转写，不等于官方作者或游戏原文 primary 核实。primary-verified 只留给后续提供确切原始证据的条目。pending 不可进入上下文。宣传解释只能是 characterinterpretation，不能升格 canonicalfact。
- 每条 knowledge 指定 owner、knownFrom、basis；public 也必须有当前角色 knowledge 证据，不以公开性推断人人知道。private 同样受拥有者约束。author 作为独立 perspective，不能透传给 furina。
- 默认小包不可由 userinteraction 改写。交互只接显式 typed 的 userfact/plan/characterspeculation，保留 speaker 与不同语义；无自然语言事实识别。
- 工厂校验并复制冻结 pack；纯函数不读写磁盘、不看当前时间、不调用模型。默认通过 JSON import 加载固定包，无新依赖。
- 先 eligibility，再按 topic/entity/alias/text 命中向量降序，最后 ASCII id 升序；不依赖 locale 或输入顺序。
- 整条 JSON 行输出，预算包含标签与头部；不截断事实。仅返回已选记录和 modelPrompt，排除原因与排除事实不返回，缺失不能解释为否定。

## Risks / Trade-offs

- 官方网页动态/空壳、搜索索引转写没有不可变旧版快照 → sourceStatus 如实标记，有限参考启用不冒称 primary；新剧情仍 pending。
- 无已核实 performer 新事件 → 用明确 synthetic boundary fixture 验证 resolver 将来能接受，不将 fixture 算作真实知识覆盖。
- 无游戏时钟的語音采用保守编辑映射 → 不宣称是精确剧情日期；新增证据可收紧 knownFrom。
- 用户文本仍是模型可见的不可信内容 → JSON 标签只提供语义隔离，adapter 必须放在数据区，不把用户字段当系统指令。

## Migration Plan

本阶段只有独立提交，不合并/推送/部署。adapter 后续只能使用 modelPrompt，在真实模型验收前复核 pending 来源与转写版次。
