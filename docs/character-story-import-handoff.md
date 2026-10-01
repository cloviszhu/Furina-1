# 芙宁娜 4.2 核心剧情导入交接

## Scope

基于 main `8402cde1d3db7d6031abdb2c403453adcc9ce79b` 的独立分支 `feat/character-story-import-42`。导入外部角色资料与枫丹主线 I–V 中芙宁娜关键出场、个人传说任务关键因果链；内容是本项目简洁中文摘要，不是对白整库。主线其余角色活动只提供必要背景，不自动赋予芙宁娜知情。没有更改 provider、index、adapter、前端或生产服务。

## Delivered

`server/data/furina-canon-4.2.v2.json`：54 条，51 enabled / 3 pending。启用条目资格为 5 `official_hosted_game_text`、38 `secondary_game_dialogue_transcription`、8 `reference-transcript-checked`。direct-game primary 为 **0**；官方托管不等于全部官方作者，镜像转写不算独立 primary。旧 v1 JSON 保留不变。

`server/data/furina-coverage-4.2.v2.json` 是覆盖、缺口、排除与冲突清单；`character-story-source-ledger.md` 列来源及每条 evidence 定位。默认 resolver 改为 v2 import，函数签名、确定性排序、相关性规则及预算逻辑沿用现有实现。

每条按既有 schemaVersion 1 保持 kind、enabled、sourceStatus、sourceRefs、canonEdition、eventAt、visibility、knowledge、topics/entities/aliases、text。扩包另记 arc、scene、validFrom、knownFrom、evidence(section/assetIds)、summaryAuthorship、causalLinks、editionBasis、knowledgeScope；新增场景还记细分 eventPoint/knowledgePoint。细分点是审计信息，运行门控仍只有 aftermath/performer 与 before-aftermath 的既有序关系。

## Coverage

| 范围 | 已导入核心场景与因果 | 明确限制 |
| --- | --- | --- |
| 角色资料 | 演技跨度、舞台工作、膨膨兽、戏剧爱好、饮食品味、长期扮演压力、角色结束与迁居 | 部分资料，不是全部语音/信件；与克洛琳德聚会时间待核 |
| Act I | 海露港公开挑战 → 林尼案检方姿态与私下担忧 → 无罪结果 | 检方指控不等于事实；非全案证据库 |
| Act II | 娜维娅证言、瓦谢定罪 → 公子判决与谕示机矛盾 → 公开辩解 | 不拥有水下调查/泉水交谈的全部见闻；公开声称早有安排不等于真实预知 |
| Act III | 初次外交茶会、要求那维莱特陪同、公子拘押与梅洛彼得堡自治 | 不自动知道监狱里旅行者的全部调查 |
| Act IV | 再次茶会受到预言追问、本人遇袭 | 袭击发生早于叙述；阿蕾奇诺内部动机仅 author perspective |
| Act V | 白淞伤亡争执、秘密调查、公众质问、镜中委托、调整神明姿态、水文监测、私下疲惫与倾诉边界 → 洪水存活与身份结束 | 芙宁娜审判具体对白 pending；人身/神性来源解释 author-only；完整计划通过 Finale 转述获知 |
| SQ 开场 | 拒绝出演 → 参与剧团与艺术顾问 | aftermath 不召回后续任务记录；早期不愿表演另有语音依据 |
| SQ 中段 | 返回白淞、娜维娅协助、面对压力、讨论坦诚关系 | 不概括为所有居民原谅，不关联当前用户恋爱 |
| SQ 终段 | 剧团往事转述、阅读奥蕾丽笔记、仍拒出演 → 杜尔菲生病后选择终曲/Clio → 重返舞台、获得 Vision、表达自己 | reported past 不变亲历；Vision 给予者与机制未知；戏剧情感不是本人恋爱 |

## Evidence and rights

本轮研究读取 HoYoDex 的任务专页、角色故事与语音转写，记录精确 URL/section/asset；没有下载或播放语音。HoYoWiki Story 4/5 与 About the Vision 的 browser-inspected 资格继承已登记的上一阶段研究，不冒称本轮重新游戏验证。HoYoDex 明示是非官方项目，正文按其 CC BY-SA 4.0 与 Fandom 署名链登记；相关摘要标记 adaptationLicense，源 URL 和 upstream attribution 保留。未将网站代码 AGPL 当正文许可，也不将文本许可扩张为游戏音频/素材传播许可。仓库只保留摘要和定位。

研究者发现 `/apocalypse` 返回后续同名 NPC 内容，与父研究给出的审判音频 ID 不一致；Fandom 任务页读取也受限。`act5-trial-pending`、`profile-clorinde-social-pending`、`teaser-stage-choice` 均禁用，不进入 prompt。后续应先取得正确任务正文或游戏证据解决冲突，不能根据熟悉剧情猜补。

4.2 edition 是明确筛选旧角色段落与 4.0–4.2 任务的编辑范围，未得到不可变 4.2 全库快照；不启用页面后续 Escoffier 等增补。网页发布时间不等于事件时间。角色解释与事件事实分离；不得据此推断情绪病、恋爱、所有人知晓秘密或当前用户亲历旅行者事件。

## Validation and integration boundary

`node --test tests/character-story-import.test.js tests/character-context.test.js tests/character-context-integration.test.js`：35/35 通过。旧小包测试明确使用 v1 factory；新默认扩包独立测试真实条目证据、覆盖清单、五幕与 SQ 多样检索、exact-query 未来门控、author-only、reported learning、pending 隐藏、稳定顺序、噪声零注入和 UTF-8 独立预算。现有 adapter/provider 测试使用隔离 mock HTTP，无真实模型、凭据或生产服务操作。

全仓 `npm.cmd test`：204/204 通过。首次缺少 worktree 中既有 `three` 依赖导致两项模块无法启动；复用主工作目录已有的 `three` 到本 worktree 的 ignored node_modules 后重跑通过，无新增依赖或主目录修改。OpenSpec strict validation 与 Git diff whitespace 检查通过。未运行 browser/build：此改动没有页面或构建代码变化。

既有 adapter 的 2 records / 1024 UTF-8 bytes 上限仍生效，用户记忆、历史与 interaction evidence 保留优先级。扩包不是每轮全量注入；只有显式当前 query/topic/entity 相关条目才可进入 prompt。能力边界仍是固定两条可对话时间线，不支持玩家任意主线进度。

未做真实模型回复/角色感知 QA，提交不等于集成或部署。下一步是集成负责人审查来源资格、缺口与实际查询样本后选择是否采纳独立 commit；详细主线覆盖仍有审判具体证据空白，不能宣称剧情全集已完成。
