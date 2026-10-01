# 来源化角色知识模块：review 修复与研究证据交接

独立分支 feat/character-context-42，worktree C:/Users/zhu06/AppData/Local/Temp/exo-character-context-42；基线 6bbed5e，初始提交 1afc9a3。当前仍未接生产。集成 owner 01a0f4a2；只修改本分支专属模块/data/tests/docs/OpenSpec。

## 接口与相关性

server/character-context.js 导出 resolveCharacterContext(options)、createCharacterContextResolver(pack)、CHARACTER_CONTEXT_LIMITS。

输入 timeline=aftermath|performer（默认 aftermath）、canonEdition=4.2（精确匹配）、perspective=furina|focalors|neuvillette|author（默认 furina），query/topics/entities，以及 maxRecords/maxChars/maxBytes 和独立 interactionBudget。interactionBudget 用同名三个字段覆盖自己的默认预算。

输出 canonicalfact、characterinterpretation、userinteraction 数组；modelPrompt 只包含前两类，interactionPrompt 只包含互动资料。所选条目保留 id/sourceRefs/knowledgeSourceRefs；转述记录另标 knowledgeMode=reported、knowledgeSourceStatus。没有排除列表、排除理由、来源验证备注或 query 回显。

先检查 edition、eventAt、owner 与 knownFrom，再按完整 topic/entity/alias 命中排序。query 只匹配完整标签，不反向用短 query 匹配标签；英文两端检查词边界，提示采用精确标签匹配。标签最低连续 2 汉字或 3 ASCII 字母/数字。canon text 只接受完整文本精确查询。空输入、a、娜、局部名字、无关闲聊均无注入。相同相关度按 kind:id codepoint 排序。

预算每区默认 8 records / 4000 UTF-16 chars / 2048 UTF-8 bytes，硬限 12 / 6000 / 4096。字节按 Buffer.byteLength(output,'utf8') 计算，包含头、JSON 标签、换行，整条跳过超限资料。canon 与互动投影完全独立；canon 为零不影响互动预算。字节数不是模型 tokenizer 的 token 数，不能宣称保证某一模型的 token 上限。

后续 adapter 必须先保留已有 interactionmemory/history 的配额，仅用剩余配额决定角色知识 maxBytes；没有剩余则零注入。不要把两个投影直接拼接后裁剪，更不能从 canon 的记录总量中挤掉真实互动。若 adapter 已有 interactionmemory 入口，继续使用该入口，本模块的 interactionPrompt 只用于显式 typed 资料，不自动重复注入。

互动 schema 为 {id,type,speaker,timeline,text,topics?,entities?,aliases?}；type=userfact|plan|characterspeculation。userfact 必须 speaker=user；输出 user-reported/not-completed/hypothesis，任何用户额外字段不能覆写 canon。

## 版本化 pack 与来源资格

server/data/furina-canon-4.2.v1.json 顶层 schemaVersion=1，内部 packVersion=furina-4.2-smallpack-v2。records 共 12，enabled=11（canonicalfact=9、characterinterpretation=2），disabled/pending=1。direct-game primary 核实数仍为 0。

本次新增来源证据由任务研究员实际浏览器读取后提供；模块作者没有重新长时间抓取同一阻断页面。没有长逐字复制。资格区分如下：

| sourceStatus | 数量（启用记录） | 资格 |
| --- | --- | --- |
| reference-transcript-checked | 3 | 已检查官方托管参考转写，不推导官方作者 |
| official_hosted_game_text | 4 | 研究员浏览器实读官方托管游戏文本，不是 publisher-authored article，也不是 direct-game primary |
| secondary_game_dialogue_transcription | 4 | 研究员实读的二手游戏任务对话转写；Fandom 镜像不算独立 primary |
| pending | 1（禁用） | teaser 正文/字幕仍未核实 |

## 小包逐条证据

| 记录 | timeline / 知情 | 来源与 locator |
| --- | --- | --- |
| navia-desserts | 两者，self-report | [HoYoWiki Navia](https://wiki.hoyolab.com/pc/genshin/entry/4576) → Character Relationships → Furina → About Navia: Desserts；只评价马卡龙，不造共同吃甜点事件 |
| navia-desserts-feeling | 两者，interpretation/self-report | 同段羡慕与请教意向，意向不等于已请教 |
| callas-duel-witness | 已发生/两者，eyewitness | 同页 About Navia: Inner Thoughts；本人说目睹决斗，不推导全部隐秘动机 |
| archon-role-ended | aftermath 起，experienced | [HoYoWiki Furina 英文](https://wiki.hoyolab.com/pc/genshin/entry/4376?lang=en-us) → Description → Character Story 4/5；水神角色是表演，危机结束后故事完结 |
| moved-out | aftermath 起，experienced | 同页 Character Story 5；离开沫芒宫到出租公寓，不泛化感受 |
| earlier-performance-reluctance | aftermath 起，interpretation/experienced | 同页 Voice-Over → About the Vision；回顾此前退出表演意向，不推导永久拒绝舞台 |
| performance-return | performer，experienced | 同语音回顾重返舞台；语音本身完成 The Little Oceanid 后解锁，解锁时间与回顾事件时间分开 |
| macaroni-daily-life | aftermath 起，experienced | [To Yesterday](https://www.hoyodex.com/wiki/genshin-impact/to-yesterday) → Approach Furina residence，vo_fnnlq001_2_furina_02/_03/_04/_06：简单家常换酱；_10 说明当时尚无 Vision，不能说通心粉是最爱 |
| clio-performance | performer，experienced | [This Life, Just Like a Light Trickle of Song](https://www.hoyodex.com/wiki/genshin-impact/this-life-just-like-a-light-trickle-of-song) → opening night vo_fnnlq003_9_furina_09 + Travel Log，出演 Clio |
| vision-received | performer，experienced | 同任务 backstage vo_fnnlq003_10_paimon_03：真 Vision 替代道具；vo_fnnlq003_10_furina_04：本人不知机制。HoYoWiki Vision 故事栏只有 ???，不是此记录证据 |
| focalors-neuvillette-private | aftermath 起，reported | [Finale](https://www.hoyodex.com/wiki/genshin-impact/finale) → About Fontaine future，vo_fdaq307_5_neuvillette_12b_2：那维莱特已完整如实转述芙卡洛斯的话；_12b_1/_7 也支持角色结束。获知不等于亲眼参与 |
| teaser-stage-choice | disabled/pending，author interpretation | [官方 teaser](https://www.youtube.com/watch?v=aau-c8l5z9c) 正文/字幕未核实，不用于剧情知识 |

早期错误假设已纠正：不能硬编码 aftermath 永不知芙卡洛斯计划。private 知识在没有合格 learning record 时排除；reported 获知需要自己的 knownFrom/sourceStatus/sourceRefs，pending learning 不授予知识。模型头和每条知识模式明确转述不能自称亲眼。未知模式 unspecified 不推导亲历。

旧二手 overview 与读取失败的 Fandom Profile 仍在 source catalog 作为历史待办，不作为新启用记录的证据。严格限定 4.2 edition，没有引入后续 backstory。原始 4.2 不可变快照、游戏客户端/官方视频实际播放核验仍缺失，不把研究员实读转写提升为 direct-game primary。

## 验证与发布边界

专属 tests/character-context.test.js 24/24；加现有 persona-natural-recap 与 persona-recall-grounding 共 37/37 通过。覆盖空/短噪声/无关闲聊、词边界、来源计数、exact-query 未来过滤、转述与目睹、pending learning、独立互动预算、中文/emoji 的 UTF-8 临界、稳定排序及无排除文本泄漏。机制 fixture 明确 synthetic，不计来源覆盖。OpenSpec strict、node --check 与提交前 diff --check 通过。

没有跑 production browser/build/full npm test：模块未接入口，隔离 worktree 无 node_modules，浏览器默认指向生产 3000。没有接 adapter、操作生产页面/服务、读取密钥/真实记忆、付费模型调用、push/main 合并或部署。真实模型 persona、剧情覆盖完整性与感知质量未验收。

集成 review 当前仍认为不应接 production，本修复不自行改变发布判断。后续由 owner 审阅新来源资格、知识模式与预算接口，再用隔离数据/fake provider 验证真正 messages 中的注入；真实 interactionmemory 优先保留。来源复核与模型/人工验收另行开展。
