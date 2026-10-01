# 连贯说话与自然互动记忆：集成验收记录

## 当前边界

独立分支 milestone/turn-segments，基于70b3c3e，已读并同步07aa的AGENTS。未部署、未推main、未重启生产app或TTS，未刷新用户页面、读真实凭据或运行真实付费请求。模型仍完整返回后分段；改善第一段TTS等待与后续预取，不称LLM streaming。

前端f3bfee5、244cddd和86f4848、自然记忆ca990c3已汇合；服务端接线edd8b5e。正式页面自然记忆控件和manual参考表达已接线并通过联合离线检查。独立审查及部署安排由父线程负责；真实模型、声线及长期动作自然度仍未验收。

## 可复现自动检查

在本worktree中执行，无需key、模型下载、生产数据库或用户逐条测试：

```powershell
node --test tests/turn-boundaries.test.js tests/turn-segments.test.js tests/interaction-memory-integration.test.js tests/persistent-memory-chain.test.js tests/memory-context.test.js
node ../../../node_modules/@playwright/test/cli.js test tests/browser/coherent-turn.spec.js tests/browser/coherent-speech.spec.js tests/browser/explicit-chat-tts.spec.js --reporter=line
```

实际node:sqlite文件库 + 随机loopback端口 + fake provider/音频/CredMan边界。播放identity由AudioContext double记录，证明事件顺序与取消编排，不证明真实音质、声线或解码。最新联合检查结果见文末，包含正式页面管理与manual检查。

| 用户路径 | 工程证据 | 能证明与限制 |
|---|---|---|
| 直接聊天自然留下记忆 | interaction-memory-integration：不点保存即形成episode；manual表仍空 | 仅成功user内容自动捕获，事件与episode同事务 |
| 超过短history仍记得 | 9次无关聊天、关闭app/DB再打开，原片段来源进入provider prompt | 实际SQLite持久化，未依赖8条history；词法检索不保证同义召回 |
| 计划与虚构 | 集成plan/fiction/negation/conflict检查 | 计划保持plan，明确取消标cancelled，fiction默认不参与真实事实检索；不是语义理解模型 |
| 明确纠正或删除 | natural与manual来源修删、别名lineage、重启后旧词不回流 | 旧事实/索引/claims/对话同步失效；保留无关显式manual记忆 |
| 并发迟到 | 生成中修正、cancel或socket断连；mock故意忽略abort | 迟到生成不提交历史/episode，迟到WAV不播放；真实请求settle前互斥和预留保留 |
| 错误恢复 | TTS失败进入error，显式新轮恢复；派生失败回滚事件+episode | 不伪造回复、不自动重试、不静默切换声音 |
| 有序演出 | 三段预取/串行start，完整拼接原文，同一时间最多一个source播放 | text/段情绪/字幕按真实start推进，结束后回idle；fixture音频不是实际TTS质量 |
| 异常容量 | 140并发cancel最多128轮，12并发相同UUID只生成一次 | TTL保护在途轮次；每轮2/全局4新合同合成，同段重复409；旧客户端兼容 |
| 手动表达 | segment emotion严格校验，referenceEmotion独立注册校验与实际响应头 | 已登记才采用；不支持manual返回400；正式页面联合检查验证采用happy及未登记失败 |

## 双模型动作证据

复用前端owner的离线stage-only证据，当前集成src/stage.js与f3bfee5一致，未因服务端集成改变。目录：`C:/Users/zhu06/Documents/ChatGPT/Project Exo/.worktrees/speech-turn-lifecycle/artifacts/coherent-stage-review/`。JSON与PNG含受限模型渲染，只保留本地，不提交或推送。

两模型骨骼数425/387，3种idle（settled/glance/attentive）；180秒确定性轨迹，模型切换、重复动作拒绝、招呼与点头完成、取消归位均通过，pageerrors为空。idle头部最大相邻帧差0.002699827 rad，取消右臂最大差0.075 rad/60Hz，是工程边界证据，不是自然度评分。

集成负责人已查看两个模型的三种idle静帧及before/after招呼对照。头部、视线与上身姿态差异可见，双脚位置稳定；招呼有小幅上身配合。真实不足：站姿仍偏直，腿部/重心变化有限，挥手显得刻意，长时间重复感、性格一致性和自然互动感仍待主观体验。不能用截图或角度上限宣称活人感验收完成。

## 后段集中验收清单（父线程安排部署后）

一次连续会话内完成：自然招呼与一段日常对话；说一个真实偏好/计划，继续聊过短history范围并在重开后自然询问；在说话和准备阶段各中断一次并恢复；查看来源并纠正、删除，确认后续不再引用旧内容；观察三种idle与招呼过渡，听语音自然度及情绪是否符合选择。真实DeepSeek发送仍需本人显式启用/逐次授权，保留预算和密钥保护；不要求先做零散API点测。

尚未得到真实模型persona、真实声线/角色相似度、长期同义记忆效果或人工活人感的验收证据。工程用例通过只说明列出的行为，不表示产品已接近完成。

## 集成异常审查修复

组合SQLite用例发现并修复：自然纠正调用旧clearSourceConversation时传NULL，SQL排除条件使无关确认来源未被保留；改用明确的非匹配排除值，保留无关确认记忆。历史清理会替换确认来源ID，现在统一追踪新旧来源别名，后续manual删除仍能同步对应自动episode。连续三次纠正保持两条独立确认记忆与两个当前别名，不随revision累积旧别名；来源/旧history/secret/计划相关检查20/20通过。达到检索结果limit后停止额外capsule派生，预算不扩大。

首次汇合全量Node检查161/162，通过项包括原有凭据/预算；唯一失败为新检索优化测试误以为中文单字“茶”属于现有二元词法索引，已改为有索引的“喜欢茶”并通过。该测试没有修改产品词法语义。最终Node复核结果须以修复后的日志为准，不以该次失败日志宣称全部通过。

修复后8b89ffd代码的最终复核：Node163/163通过（36.8秒，含真正SQLite及fake Windows凭据bridge）；五项Edge浏览器检查5/5通过（34.4秒，包括顺序演出、中断/模式/迟到、现有manual记忆DB reopen、adapter-only自动记忆控件）。日志在本worktree的artifacts/coherent-milestone/node-final.log和browser-final.log。Vite审阅构建输出到artifacts/coherent-milestone/build，未写生产dist；有既有774kB bundle警告。OpenSpec全部14项strict通过。自然记忆正式页面与referenceEmotion前端增量仍需汇合后检查，adapter-only控件检查不能替代正式页面集成。

只读审查开发分支：`https://github.com/cloviszhu/Furina-1/tree/milestone/turn-segments`，推送已确认。与main07aa的AGENTS文件无差异，等价cherry-pick不需要重复覆盖文档。已检查推送文件清单和numstat，无模型/渲染PNG/音频/运行DB/秘密/工作树目录；未推main、未创建PR、未部署。

## 最终前端汇合与独立审查修复

86f4848 已汇合为 88fc252。正式页面接上自然片段列表分页、eventId 纠正/删除、跨页刷新、失败保留草稿、retained:false 刷新移除，以及 manual 参考表达采用响应头和未登记失败。最新联合 Node169/169（17.7秒）、六项演出/记忆页面浏览器6/6（29.9秒）、三项旧显式聊天与测试面板浏览器3/3（12.1秒）。Vite review build 通过（781.81kB，仍有既有大包提示），14项 OpenSpec strict 通过；日志分别为 node-merged.log、browser-merged.log、browser-compat.log、build-merged.log、openspec-merged.log，均在本 worktree artifacts/coherent-milestone 下。上文163/5是该次历史基线，不冒充最终结果。

独立审查P2之一：显式 remoteTest:true 即使输入普通第一人称文本也不能自动形成长期事实。已在成功提交中排除自动 ingestion，返回 test-source，events remote_test 保存测试来源；既有短期历史和手动确认保持原行为，不追溯删除或改写旧用户数据。隔离HTTP测试验证普通测试文本不入自动记忆、重启仍不召回，正式聊天仍入、原手动确认未改变。

独立审查P2之二是静态高量扫描风险，没有实测冻结证据。新提取每 episode claims 去重且最多12个，旧库读取也最多12个；冲突核查通过 MATERIALIZED 限制 indexed predicate/subject peers，最多129行（128核查+1截断检测），避免先全量连接或排序。检索默认24次导出、最多48次，超字节预算的拒绝项也消耗导出预算。300个含12个claims的episode、2400bytes预算检查确定性验证24次导出、288次有界peer查询、每次最多129行，200次重复clause只形成1条claim，80个不同clause最多12条。原文不截断保存。有界核查可能漏掉样本外的矛盾/取消，所以截断而无直接证据时标记 unknown/bounded-incomplete，并通过provider提示明确未知；它不是全库无冲突证明，容量增长后的更精确语义检索仍是质量改进空间。

所有检查仍是隔离mock/local证据，未运行真实付费模型、读取真实凭据或修改生产状态；双模型动作证据沿用同一stage代码的本地结果。最终独立审查和集中真实/主观验收尚待父线程安排。
