# ASR与剧情扩包：同一开发release复审交接

分支milestone/asr-draft，基于已部署main8402cde；汇合ASR2954c092→600c41f、route集成f860488、剧情5be07e3→1e1f7a8。main、生产app/TTS与用户页面未改；没有读取密钥或发付费请求。

## 剧情扩包审查

默认resolver改用v2；54摘要、51enabled、3pending，enabled资格5official_hosted_game_text/38secondary_game_dialogue_transcription/8reference-transcript-checked，direct-game primary仍0。审阅来源账本和资格，没有重新冒称原始游戏核实。[来源账本](character-story-source-ledger.md)保留URL、section、asset定位、改编许可与上游署名；数据是项目中文摘要，不是对白或音频整库。

现resolver签名、furina/4.2固定视角、时点与获知门控、两条/1024UTF-8字节adapter保持。细分eventPoint/knowledgePoint仅审计信息，实际仍只有aftermath/performer两种时间线，不能宣称任意剧情进度支持。用户互动优先、总序列化请求费用预算和HEADER资格措辞保留，前端/ASR文件无来源扩包冲突。

重点核对：act2-public-defense为characterinterpretation，正文明确“维持姿态的说法，不是计划真实性的证明”，experienced仅说明说过这句话，不证明真实预知；act5-plan-reported为Finale后reported获知，不能写成事先掌握或亲眼参与。敌方动机/来源解释author-only，固定furina不召回。审判页路由冲突、Clorinde聚会时序、teaser三条仍pending，system投影不含其文本/理由/来源待办。

实际adapter查询海露港、林尼审判、公子判决、首次/第二次茶会、秘密调查、白淞回访、终曲选择均在2条/1024字节内，未召回甜点默认。实体相关仍可能宽泛：例如“克洛琳德聚会”召回该人物已知决斗，未输出pending聚会内容；这是词法相关而非意图理解，不能让模型据此编出聚会。主线/个人任务覆盖有所扩展，仍有审判证据缺口、来源核实限制和2条选择容量，不称全剧情完成。

新增三个adapter/实际HTTP fixtures核验宣称知情vs实际reported、pending隔离、实际两条投影、SQ成对时点，以及用户断言不改canon。扩包与ASR联合目标检查61/61通过（4.96秒），OpenSpec全仓strict检查17/17通过；本机日志为`artifacts/asr-integration/story-joint-final.log`与`artifacts/asr-integration/openspec-story.log`。源分支204全仓是原作者阶段结果，不冒充本次全量重跑。

## ASR复审delta与真实边界

详见[ASR联合交接](asr-integration-handoff.md)：修复满128未知取消挡住active取消，保留最多129（128未知+唯一active例外），不驱逐旧记录。真实独占Node子进程close/cleanup、迟到409、TTL恢复已回归。一次真实Edge MediaRecorder合成流/实际FFmpeg探针stop约30.003秒、decoded30秒、UI草稿，临时目录0、真实麦克风0、实际Whisper0；未复现最大时长超限，不放宽后端限制，也未改前端时限。它不证明其他设备/codec/高负载或真人识别质量。

开发release仅推本分支供独立审查，不部署或推main。前端构建仍与已通过的ASRreview build一致（本次仅server/data/tests/docs变化），无需重复相同构建。真实模型遵守知识边界、原始游戏来源、真人ASR/声线/动作感知仍待集中验收。
