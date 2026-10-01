# Spec Delta

## Purpose

把芙宁娜的来源化角色资料与枫丹主线各幕主要出场、个人传说任务因果链转化为简洁可审的检索记录。每条摘要保持来源资格、剧情阶段与获知方式，以明确 coverage 和缺口支持后续审查，不用记录数量、镜像或测试结果推导剧情完整性及角色体验质量。

## ADDED Requirements

### Requirement: 场景与来源覆盖
导入 SHALL 提供 Act I–V、个人任务三段、角色故事的 coverage。启用记录 MUST 有精确 URL/section，任务对白有可用 asset ID 时记录；无语音的动作/Travel Log SHALL 明确标记，不捏造 asset ID。

#### Scenario: 各幕主要出场
- **WHEN** 检索林尼案、失踪案、公子判决、外交、预言调查或长期扮演
- **THEN** 召回对应场景来源化摘要，而非反复以甜点偏好替代。

#### Scenario: 缺口与路由错误
- **WHEN** 审判正文入口路由碰撞或聚会时点未知
- **THEN** coverage 明确 pending/partial，不能把网页可访问等同于正文核实。

### Requirement: 角色认知与事件链
导入 MUST 区分经历、转述、作者所见和 attributed interpretation，分开 validFrom/knownFrom；不能将公众姿态、指控、戏中人物经历、未公开动机升格为芙宁娜已知真相。

#### Scenario: 对手的私有动机
- **WHEN** Furina 查询袭击事件
- **THEN** 能知本人遭袭及反应，不能自动获得玩家看到的袭击者夺神之心动机。

#### Scenario: 个人任务未来经历
- **WHEN** aftermath 查询拒演当次会面、艺术顾问、白淞回访、奥蕾丽笔记、Clio 或 Vision
- **THEN** 排除未来事件；performer 可召回合格记录，但不把阅读笔记说成亲历奥蕾丽死亡、不把 Clio 恋爱移植给芙宁娜。

### Requirement: 保持检索与预算
扩包 SHALL 保持显式 query、短噪声零注入、稳定排序、UTF-8/字符/记录限制和独立互动预算；数据扩容不能提高单次注入或覆写用户记忆。

#### Scenario: 扩包后闲聊和关系查询
- **WHEN** 输入无关闲聊或有完整关系/事件标签的查询
- **THEN** 前者无 canon 注入，后者提供相关资料，同时保留完整原互动资料和预算边界。

### Requirement: 权利与证据诚实
摘要 SHALL 为自行简洁改写，保留许可/署名/来源上游元数据，不复制长对白或素材，不跨镜像洗成 primary，不导入 4.2 后 backstory。测试 MUST 区分实际来源记录与 synthetic fixture。

#### Scenario: 社区转写与官方托管
- **WHEN** 读取 HoYoDex/Fandom 镜像或 HoYoWiki 托管文字
- **THEN** 分别保留 secondary/reference/official-hosted 资格，direct-game primary 数如实报告，未播放资产不记为音频核实。
