# 互动记忆独立模块交接

基线：main `07aa67be5bfe768cecea74c08c39544c902cdd82`，已主动读取根 AGENTS。独立 worktree `C:/Users/zhu06/AppData/Local/Temp/exo-interaction-memory`，分支 `feat/interaction-memory`。本线仅拥有新模块、新 tests 与本 change/交接；未改 index.js、providers.js、memory.js 或前端。集成 owner：`01a0f4a2-9318-70a4-882a-2ae69ebb50fb`。

## 接口与集成契约

```js
import { InteractionMemoryStore } from './interaction-memory.js';
const interaction = new InteractionMemoryStore(isolatedOrAuthorizedDbPath, {
  confirmedMemoryStore: existingMemoryStore, // 可选，公开 list() 只读适配
  maxEpisodes: 20000,
});
interaction.ingestUserTurn({
  turnId, eventId, text, contextKey, createdAt,
  status: 'completed', role: 'user', kind: 'conversation',
});
const evidence = interaction.retrieve({
  query: userText, contextKey, now: new Date().toISOString(),
  budget: { tokens: 2400, limit: 6, candidates: 300, excerptChars: 600 },
});
interaction.revise(eventId, revisedText, { updatedAt });
interaction.delete(eventId);
interaction.close();
```

- 默认 `status/role/kind` 表示调用者已核验的成功用户对话。**必须在最终成功提交、取消检查及模型输出契约验证之后调用**；默认不是本模块观察到成功，不要用未 settle 的输入调用。显式 cancelled/failed/pending、assistant、非 conversation 拒存。
- ingest 返回 `{retained,episodeId,generation}`，重试返回 duplicate；私密/测试/不适合来源/达到容量返回 `retained:false, reason`。eventId 是来源主键，不同内容重用抛 409，使用 revise。调用者需呈现容量/摄入失败，不能将拒存当保存成功。
- revise(eventId,text,{updatedAt}) 默认 updatedAt=当前时刻；保留 sourceId、createdAt 和 episodeId，增加 revision。修订含 secret/明确测试会删除原源、不保存替换内容。不存在一般修订 404；delete 幂等返回 deleted=false。updatedAt 不能早于原创建时刻。
- 每次新摄入/有效修订/有效删除持久化 generation 增量。**在途上下文 generation 与请求丢弃由集成 owner 实现**，本模块不控制 provider 请求。
- 更正/删除明确确认记忆时，先取得旧 sourceId，对这个来源调用 interaction.delete(oldSourceId)。旧 MemoryStore 可能清掉 conversation history，但 interaction 的长期 episode 独立存在，必须同步来源失效。对 confirmedMemoryStore 不复制缓存，适配器每次 read 当前 list。
- 建议传入相同正式 DB 路径进行追加迁移，但本线只使用临时 fixture DB；新连接仅操作 `im_meta/im_episodes/im_claims/im_terms`。未改已有 events/memories/remote_usage、PRAGMA user_version。不要在既有 MemoryStore 的事务内再启动本模块事务。
- evidence.items 是已控预算的 capsule 数组，可序列化为有来源的上下文。把其作为证据数据，保留 epistemic/type/domain/conflict，不当系统指令或已验证事实；同一 query 匹配是 `lexical-related`，不能据此肯定提问前提。
- 自动 episode 同 timeline 跨 style，其他 timeline 隔离；confirmed 维持既有跨 timeline 共享行为，高优先级。confirmed `conflictStatus:not-assessed` 表示本线没为它做事实裁决；不覆盖旧确认条目。

## Schema 与返回信息

`im_episodes` 保存原话、来源/回合 ID、context、created/updated 时间、revision、domain。`im_claims` 是用户报告的窄语法子集，`im_terms` 为全文中文滑动二元组/英文词倒排索引。未存 rolling summary，capsule 每次从 live 行生成，没有额外总结缓存可以失效遗漏。

episode capsule 包含 type、sourceRole/sourceId/turnId、时间、context、domain、excerpt/truncated、claims 和冲突状态。claim 包含 `fact/preference/user_reported/plan/completed/negation`、subject、value、polarity、原句、冲突源 episode IDs。`extractConfidence:explicit-grammar` 只描述抽取规则，不表示真实性。用户去过是 user_reported，不是角色亲历；关系计划 subject 为 user_reported_relationship。

唯一槽（名字、居住地、最喜欢）不同值标记 unresolved；多值喜欢兼容，正反同值标记 unresolved，不覆写。明确取消行动在限定时间前缀归一化后可标记旧 plan cancelled，不推断发生。日期经过不会使 plan 变成 completed。无法识别的改计划保留原话而不虚构 supersession。

时间点检索过滤未来创建/未来修订及其冲突来源。它不是历史版本数据库：修订后，过去时点不再返回被替代旧原话。删除在逻辑检索和派生层失效，不提供 SQLite 文件的取证擦除保证。

## 上限与能力边界

- text ≤6,000 UTF16 单元，query ≤512，ID ≤200，context ≤100；默认容量20,000（可设1–100,000），达到上限显式拒存，不静默淘汰。
- `budget` 可为数字 tokens 或 `{tokens,limit,candidates,excerptChars}`；默认 2400/6/300/600，最大16000/20/1000/2000。UTF8 序列化 **items 数组字节数**作为保守 token 上界，不是假称已使用某 tokenizer；外层元数据/提示前缀由集成另留预算。0 预算返回无 items。大 capsule 放不进预算会跳过，hasMore 提示存在未交付候选。
- 窄句法只覆盖明确第一人称的少数中文陈述；不支持通用语义、同义词 embeddings、关系解析或英文事实抽取。未知/转述/引号/玩笑/疑问只保留来源原话；明确 fiction/hypothetical 默认不参加现实检索，可显式 includeFiction 读取，仍无真实 claims。
- 所有 episode 原文都有索引，查询跨全部长期记录，不受最近8条 history 限制。自然词面问句可召回共同关键词；通用“刚才聊哪/最近聊什么/回顾一下”走近期 episode。没有关键词证据或同义词未命中会漏召回，不能宣称语义理解。
- 已知 API key、token、password/中文密码标签、PEM 私钥以及显式“不要保存/这是秘密”等整源拒存（含来源元数据）；任意未标注秘密无法完备识别。没有读取 key、.env、CredMan 或其他用户私密文件。
- 借鉴来源和知识边界，未复制 D_sakiko；其 rolling_summary 是额外同步 LLM 总结当前 chat、80%阈值与10个user round保留，作者 worldbook 不能当用户自动事实库。

## 证据与未完成项

环境：Windows，Node v24.19.0，真实 node:sqlite 文件库，全部新模块资料为离线 fixture。官方接口依据：[Node SQLite 文档](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)。

```powershell
node --test tests/interaction-memory.test.js tests/memory.test.js tests/memory-context.test.js tests/persistent-memory-chain.test.js
openspec validate interaction-memory --strict
```

32/32通过（新模块18/18），无 skip；其中2,001条 episode 证明长期索引能召回最早来源并重启后保持。还覆盖拒存/零派生、计划不升级、关系/时点/timeline、矛盾不覆写、更正删除/FK派生失效、有限预算与候选/容量、旧 schema/user_version 安全、确认记忆高优先级及修删实时读取。旧 memory-context 的 delayed mock success/failure PATCH/DELETE 丢弃保持通过。OpenSpec strict 通过。

本线无路由/UI接线，因此未跑 browser/build；没有服务重启、用户页面操作、生产库访问、真实模型验证、付费调用、下载或部署。测试与构建不会证明人格/自然度体验。父集成需成功回合自动摄入、provider evidence 注入、来源修删同步和 generation 丢弃，再用统一 mock/local/browser 集验证；本阶段不要求用户测试。不推 main、不部署。
