# Design

## Context

8402cde 已接入 12 条 pack 的预算 adapter；旧 resolver 支持多来源和 reported knowledge。此次保留旧 JSON，新增 v2 JSON 与 coverage，默认只改 import，不碰集成入口。

## Goals / Non-Goals

**Goals:** 覆盖各幕芙宁娜关键出场与个人任务因果链，逐条 provenance、剧情/获知时间及关系边界可审。

**Non-Goals:** 不按条数宣称完成、不扩预算/变检索算法、不合并玩家视角为角色全知。

## Decisions

- 两个只读研究子任务按主线/个人资料分工；实现与文件由本 agent 统一写入，父研究证据也标 provenance。网页实际读取是转写核查，不是播放 voice asset；同源镜像不是独立 primary。
- JSON 保持 schemaVersion=1，每条新增 evidence[]（sourceRef/section/assetIds）、arc/scene、validFrom/knownFrom、eventPoint/knowledgePoint、causalLinks 和边界说明。只 text/knowledgeMode 等已有最小字段进模型；ledger 不进 prompt。
- 旧 12 条复制后逐条补元数据。新源用既有 secondary_game_dialogue_transcription 或 reference-transcript-checked，profile narrative 在 source.documentType 明确区分。继承 HoYoWiki 上阶段 browser-inspected 资格，不声称本阶段重新读取。
- 只有两用户时点；SQ 当次拜访、顾问、白淞与演出一律 performer 可用，早期倾向另列回顾。Clorinde 聚会相对 SQ 不明确，保留 pending，不能靠后发布日决定时间。
- 指控与演出是情境行为，不当最终事实；感受与动机说明为 attributed interpretation。特殊攻击者内心、神座方案机制限定 author，后者可用 Finale 独立 reported learning，前者未证实告知则不给 Furina。
- HoYoDex 改编记录标 CC BY-SA 4.0、上游 Fandom 与 game underlying rights。只写短自行改写，不复制长原文/素材，不改变代码许可。路由碰撞与研究链冲突明确登记。

## Risks / Trade-offs

- 公开页面不是不可变 4.2 快照 → 只从具体 4.0–4.2 任务/角色段落摘录，保留 revision/edition 及来源资格限制。
- Apocalypse 同名路由误指后续 NPC → 与父研究提供的具体 asset 对照，原场景条目保守 pending；相邻可读 Opera 支撑其他审判/记忆场景，不能称全部审判核实。
- 当前 adapter 2 records/1024 bytes → 扩包提高可检索多样性，不增加单次注入；统一隔离回归检查真实 messages。
- 人设感知需要真实模型/人工证据 → 本阶段只报告文本检索与 provenance 验证。

## Migration Plan

独立分支提交供 owner review。未部署；旧包保留作回退/兼容性测试。默认切换 v2 的一行 import 可单独回退，不触及 history/memory。

## Trial source increment

原 HoYoDex Apocalypse 路由继续 pending。独立 Fandom 搜索索引仅支持五窄命题，保留 verificationMethod/directPageVerified/audioVerified，不将 search index 升为直接页面/primary。指定控诉否认、trap 构造与道歉未完整返回仍待核；当庭自称身份不等于真实神性，浓度披露为 reported，裁决不授予秘密计划机制。
