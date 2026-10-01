# 来源化角色知识与知情边界交接

本阶段是独立模块交付，未接入生产 prompt。worktree：`C:/Users/zhu06/AppData/Local/Temp/exo-character-context-42`；分支：`feat/character-context-42`；基线：`6bbed5e`。集成 owner 01a0f4a2 正在发布连续互动，本分支只新增专属文件，不修改 index/providers/persona 或根目录交接。

## 接口与 schema

`server/character-context.js` 导出：

```js
import { resolveCharacterContext, createCharacterContextResolver } from './server/character-context.js';
const context = resolveCharacterContext({
  timeline: 'aftermath',       // aftermath | performer，默认 aftermath
  canonEdition: '4.2',        // 精确匹配；不认识的 edition 不提供 canon
  perspective: 'furina',      // furina | focalors | neuvillette | author
  query: '马卡龙',
  topics: [], entities: [],   // 可选显式提示，优先级 topic > entity > alias > text
  maxRecords: 8, maxChars: 4000,
  interactions: []
});
// 后续 adapter 只插入 context.modelPrompt。
```

输出：`{schemaVersion, packVersion, timeline, canonEdition, perspective, canonicalfact:[], characterinterpretation:[], userinteraction:[], modelPrompt}`。所选事实/理解带 `id/kind/sourceStatus/text/sourceRefs`；sourceRefs 可用本地版本化 JSON 查证，不把整份 JSON 或来源验证待办放入模型。纯函数不会读写真实记忆、网络或时钟，返回值修改不影响后续调用。

小包：`server/data/furina-canon-4.2.v1.json`。顶层 `schemaVersion=1, packVersion, canonEdition, sources[], records[]`。source 含 URL、locator、authorship、sourceStatus、checkedAt、publication、evidence；record 含 id、kind、enabled、sourceStatus、sourceRefs、canonEdition、eventAt、visibility、knowledge[{owner,knownFrom,basis}]、topics/entities/aliases、text。诊断/待办只存在本地包和文档中。

事件阶段固定为 `before-aftermath < aftermath < performer`。`aftermath` 是主线结束、传说任务前；`performer` 是传说任务刚结束。即使事件已发生，也需要该 perspective 已在 knownFrom 获知；public 不能自动推断人人知道。publication 是来源发布信息，永不作为事件时间。宣传解释的 `primary-promotion-checked` 只能进入 author 的 interpretation，不得授予芙宁娜知情或变成 canon。

互动 schema：`{id,type,speaker,timeline,text,topics?,entities?,aliases?}`。type 为 `userfact | plan | characterspeculation`；speaker 为 `user | assistant`（userfact 必须 user）。输出分别标记 `user-reported | not-completed | hypothesis`。这只是明确输入契约，模块不会从自然语言自动判断事实或计划，也不会将用户的 kind/enabled 等额外字段提升为 canon。adapter 必须从授权的互动来源提供显式分类，不要把全部 assistant 历史当已证实事实。

预算对全部类别共用：默认 8 条/4000 UTF-16 code units，硬上限 12 条/6000 code units。maxChars 是 JS `.length`，不是 bytes/token；包含固定语义头、JSON 标签与换行。整条跳过超限资料，不截断命题；0 预算返回空 modelPrompt。知识先过滤再相关度排序，最后按 `kind:id` 的 codepoint 顺序打破平局，不依赖 locale 或输入顺序。无召回不能推出“未发生”。

## 来源账本与实际覆盖

9 条小包记录中 enabled=3（canonicalfact=2、characterinterpretation=1），disabled/pending=6。primary-verified=0；已启用是检查过的官方托管转写参考，不是游戏原始文本/音频核实，也不是宣称全部 HoYoWiki 内容为官方作者。

| 记录 | 状态 | 本次证据与限制 |
| --- | --- | --- |
| navia-desserts | enabled/reference-transcript-checked | [HoYoWiki Navia](https://wiki.hoyolab.com/pc/genshin/entry/4576) 的 Character Relationships → Furina → About Navia: Desserts 转写；本人对马卡龙装饰、口感、甜度的评价，不能造共同吃甜点事件 |
| navia-desserts-feeling | enabled/reference-transcript-checked / interpretation | 同段中的羡慕与请教想法；想法不是已经请教 |
| callas-duel-witness | enabled/reference-transcript-checked | 同页面 About Navia: Inner Thoughts 中本人说目睹过决斗；不推导全部动机 |
| teaser-stage-choice | disabled/pending / interpretation | [官方 teaser](https://www.youtube.com/watch?v=aau-c8l5z9c) 标题取得，正文/字幕未取得；只能待验证舞台/选择宣传主题，不能补剧情 |
| archon-role-ended | disabled/pending | [HoYoDex Storyline](https://www.hoyodex.com/wiki/genshin-impact/furina-storyline) 的 Post-Archonhood Life 二手概述可读；[HoYoWiki Furina](https://wiki.hoyolab.com/pc/genshin/entry/4376) 无可读正文 |
| macaroni-daily-life | disabled/pending | 同二手概述有通心粉线索，原始任务转写未取得 |
| clio-performance | disabled/pending | 二手概述有演出线索，Clio 名字/替演/过场尚待原始文本核对 |
| vision-received | disabled/pending | 二手概述有 Vision 线索；原始获得时机未核对，aftermath 永不允许未来事件 |
| focalors-neuvillette-private | disabled/pending | 私密对话线索待原始任务核对，knowledge 不包含 furina |

另外尝试 [Fandom Profile](https://genshin-impact.fandom.com/wiki/Furina/Profile)，工具返回 402；不能记为已读或已核实。官方域内的用户帖/分析帖没有作为 primary。本次多组 primary 搜索未取得可用原始关键剧情文本；没有扩大下载、音频复制或模型调用来弥补。

HoYoWiki 直接页面是动态空壳，本次证据来自检索工具返回的完整关系/语音转写，未取得不可变 4.2 历史快照。4.2 是本包的编辑基准；语音没有精确世界内日期，desserts/feeling 的 aftermath 是保守编辑映射，duel 是文字明确的过去事件。启用条目保留这一限制；若集成验收要求全部 primary 或旧版快照，则应暂禁这三条，或先逐条对照 4.2 游戏原始资料再启用。没有引入后续 backstory、Escoffier 等内容。

## 验证证据与边界

- `node --test tests/character-context.test.js`：19/19 通过。
- `node --test tests/character-context.test.js tests/persona-natural-recap.test.js tests/persona-recall-grounding.test.js`：32/32 通过；覆盖现有静态人设与回忆组装契约。
- `node --check server/character-context.js`、`openspec validate sourced-character-context --strict` 与提交前 `git diff --cached --check` 通过。
- 未来已核实 Vision/演出、私密对话、后发布旧事用显式 SYNTHETIC fixture 验证机制；fixture 不计真实来源条目，也不证明 performer 剧情已经核实。默认真实包的 pending 条目另有独立禁止召回测试。
- 验证包括 exact-query 时点过滤、owner/公开性、后获知、edition 精确匹配、稳定排序、中文 alias、共享预算、整条跳过、用户冲突/计划/推测隔离、无排除内容/来源说明/剧透原因/查询回显，以及快照不可被调用者修改。
- 未跑全量 npm test、build 或 browser：新增模块没有接入入口或 UI，隔离 worktree 没有 node_modules；浏览器配置指向生产 3000，不能借此验证本分支。没有安装新包、操作生产服务或用户页面。
- 真实模型、生产 adapter、部署、角色自然度/人设感知质量均未验收。无凭据/API key/真实记忆读取，无付费调用、push/main 合并或部署。

## 下一步（交给集成 owner）

先 review/cherry-pick 独立提交，确认现有人设中的 Vision/剧情事实与本模块 pending 状态有差异：旧 persona 是既有约束，不是本次来源核实成果。后续 adapter 显式固定 perspective=furina、edition=4.2，并按用户已选 timeline 调用；author 输出不可送入角色第一人称 prompt。只插入 modelPrompt，不插入 source catalog、pending、排除列表或验证报告；数据区的用户文本不可当系统指令。

接入时使用隔离 DB/fake provider 检查真实 messages 中没有未来/不知情内容，并保留 canonicalfact/interpretation/interaction 标签。补来源时先核对 primary locator、版次、事件时间与角色获知依据，再更改 enabled/sourceStatus/knowledge；不能仅为增加数量而启用 secondary。最后再安排一次真实模型与用户感知 QA，当前提交不提供这些证据。
