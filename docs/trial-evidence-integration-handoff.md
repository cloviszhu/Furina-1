# 审判窄增量集成审查

基于已发布main `7e6b9bd8230b66b6d5204ba3d1896c8de32d5492`，独立worktree `artifacts/worktrees/trial-evidence`，分支 `milestone/trial-evidence`。源增量 `3cc70e77b9ea2fc8524fb2b24f7d5e7e62857424` 已cherry-pick为 `ffe422f`；依赖5be07已在main。仅数据/覆盖/来源账本/规格/测试变化，不改ASR、provider实现、前端或生产服务。

## 判断与来源限制

可作为有资格限制的窄增量采纳。新增6条、5enabled/1pending；总60/56enabled/4pending，direct-game primary仍0。新source `aq5-trial-search`明确为二级转写、search_index_inspected、directPageVerified=false、audioVerified=false，不追溯修正旧HoYoDex错误路由的disabled历史。改写摘要保留来源/署名/许可；索引可能不完整或过时。

集成审查重新搜索[Fandom Apocalypse](https://genshin-impact.fandom.com/wiki/Apocalypse)，取得含8_neuvillette_13–19的索引判决片段；直接页面受robots限制，另外两项查询未取得可用正文。因此本次不能称五个启用命题均独立重新来源核实，水测试/浓度/舞台等仍依赖原研究者登记的索引证据。没有访问音频、下载素材或用其他人物推测补齐。

记录分别限制为法院舞台经历、接受审判、水测试及当庭声称、浓度披露reported、两个判决。水中未溶解不是神性证明；当庭浓度获知不变事先计划，判决不授予私密执行机制。固定aftermath/performer可知审判结果；细分eventPoint/knowledgePoint仍审计信息，不宣称任意剧情进度门控。既有Vision/SQ未来与author-only门控保持。

## 统一目标验证

相关Node40/40通过（约0.40秒）：character-story-import、character-story-adapter、character-context、character-context-integration。新增一项真实app HTTP隔离fixture，五个查询×两种时间线共10请求，fake本地provider、不读真实凭据：核验实际system投影、claim措辞、reported获知、secondary资格和未独立游戏原始资料核实HEADER；两条canon上限、序列化16000字节总预算、接近满额时保留用户字节并整段丢弃canon，真实付费使用0。既有测试验证1024UTF-8独立canon预算、pending及来源待办不出prompt、历史与互动记忆分区、未来门控。

首轮新增fixture把既有HEADER的“原始资料”写成“原始素材”，断言失败；对照实现修正测试文字后40/40通过，无产品代码修补。OpenSpec全仓strict17/17、Git diff检查通过。源分支205全仓是原研究者证据，本次未冒称全仓重跑。没有页面/构建变化，不重复浏览器/build或ASR重负载检查。

## 仍待补足

scene4陷阱搭建、白淞道歉与scene5指定控诉/否认完整片段继续缺失/pending；不能称Act V审判全集或全剧情完成。模型实际遵守资格/获知边界及角色感知未验收。verificationMethod等精确方法留在账本，实际prompt使用既有secondary资格与统一未独立原始资料核实声明，未提升为direct-page/audio/primary等级。

仅推开发分支供独立最终复审，本阶段未合并main或部署。现有ASR生产代码与模型、TTS、用户数据、预算和页面保留；无麦克风或付费请求。
