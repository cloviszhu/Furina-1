# Design

## Context

现 MemoryStore 提供 events、明确确认 memories 与短 history；本线不改这些表和接线。主分支 07aa67b 已含根 AGENTS。现有明确确认记忆全 timeline 共享，自动 episode 按同 timeline 的 style 兼容键筛选，保留这一差异。

## Goals / Non-Goals

**Goals:** 无额外调用地保留成功回合原话并可检索；区分用户报告、计划、否定、未知和关系信息；所有派生结果能追溯和失效。

**Non-Goals:** 通用语义理解、角色亲历真实性验证、自然度验收、路由集成、生产迁移执行、部署。extractConfidence 仅表示语法抽取把握，不表示事实真实性。

## Decisions

- 提供 InteractionMemoryStore(file, {confirmedMemoryStore, maxEpisodes})，仅追加 im_* 表，开启 FK；schema version 独立，不改既有 user_version。单 SQLite 事务写 episode、claim、倒排索引，重复 eventId 幂等，改写须 revise。
- ingestUserTurn({turnId,eventId,text,contextKey,createdAt,status='completed',role='user',kind='conversation'}) 的默认语义是调用者已核验成功。传入 cancelled/failed/assistant/test 均拒存，集成必须成功提交后调用并处理容量提示。
- 除显式隐私拒存/secret 外，成功用户原话保留 episode；fiction/hypothetical/test 不作为现实召回，retrieve 默认仅 reality/uncertain。未知表达仍是 attributed episode。确定 claim 使用完整句子锚定的窄中文语法子集，绝不只凭目的地等关键词生成事实。user_reported 与 completed 仅指用户报告；计划日期即使过期仍为 plan。
- 所有文本建立中文滑动二元组/英文词倒排索引，跨全部长期 episode 匹配，排序词频逆文档频率；通用回顾才取近期原话。候选数、query、结果数、输入大小、总 episode 和 tokenBudget 都有限，原话返回带省略标记 excerpt。UTF8 序列化字节数作为保守 token 上界，明确不是特定模型 tokenizer。
- claim 冲突从存量动态计算：唯一槽不同值为 unresolved，多值喜欢仅正反同值冲突；不覆盖旧值。明确取消计划按去时间前缀的行动值对照；未识别改计划保留原话，不伪造 supersession。更正/删除重建/级联删除全部自有派生，generation 增量交给集成使在途上下文失效。
- 只读 confirmedMemoryStore 的现有公开 list 和源 context；明确确认原有全 timeline 共享政策不变，优先级高，secret 与来源用户校验仍适用。适配器故障向调用者报错，不隐瞒为无记忆。
- 不复制 D_sakiko：其 rolling summary 额外同步 LLM、作者 worldbook 不是用户自动事实来源。

## Risks / Trade-offs

- [词面检索无法保证同义改写或隐含关系匹配] → 原话与 provenance 保留；不匹配返回缺证据，交接明确局限。
- [任意秘密无法完备识别] → 已知 API key/token/password 模式及显式隐私拒存整条拒绝，不部分保存泄露值，不扫描文件。
- [规则遗漏确定信息] → 留完整 episode，而不强行抽取；检测未知、否定、转述、引号、假设时不抽取确定 claim。
- [上限达到] → 显式 capacity 拒存；不自动删除真实长期数据。

## Migration Plan

构造器事务性 CREATE IF NOT EXISTS 和独立 schema version；既有表、事件、记忆、使用量原样保留。只在隔离 SQLite 证明。集成 owner 成功回合接线、确认记忆修删时同步来源 invalidation，统一验证后决定部署；本线不部署。回滚停止调用本模块即可，保留追加表。
