# Spec Delta

## Purpose

使长期互动记忆从成功的用户对话自然形成、筛选与有据召回，保留用户原话归属和时间，不把推断、角色台词、假设或未来计划当作已发生的用户真实经历，并允许用户修正和删除来源及其派生内容。

## ADDED Requirements

### Requirement: 成功用户来源自然形成长期 episode
系统 SHALL 自动接受成功用户回合并在重启后保留来源 ID、上下文、时间、原话；MUST 拒绝取消、失败、助手来源和测试回合，已知凭证及显式私密内容 MUST 不持久化。

#### Scenario: 重启与秘密边界
- **WHEN** 成功用户来源保留后重启，而另有取消回合与密码输入
- **THEN** 原成功来源可召回，取消与秘密无 episode、claim 或索引

### Requirement: 保守知识边界
系统 SHALL 区分 user_reported、plan、negation、uncertain 与 fiction/hypothetical；抽取置信度 MUST 不宣称真实性；计划过期 MUST 不升级完成；角色自己说的话 MUST 不当用户经历。不识别的表达 SHALL 保留有归属原话而不推断事实。

#### Scenario: 用户报告与计划
- **WHEN** 用户分别报告去过与计划去，而时间已过去
- **THEN** 两者仍是 user_reported 和 plan，不能声称角色亲历或计划已完成

### Requirement: 有据有限检索
系统 SHALL 对短历史窗口之外的长期 episode 按词面索引检索，返回来源、时间、类型、归属、冲突和预算信息。通用回顾 SHALL 返回近期 episode。自动记忆 MUST 按 timeline 兼容键筛选；现有明确确认记忆 SHALL 保留其共享政策和高优先级。结果数量、输入、候选和序列化 token 上界 MUST 受限。

#### Scenario: 大量历史与上下文过滤
- **WHEN** 大量无关 episode 后用户自然询问早期记录的关键词，或者切换 timeline
- **THEN** 相关早期 episode 可召回，另一 timeline 的自动 episode 不泄露，结果总预算不超上限

### Requirement: 纠错删除派生失效及矛盾
系统 SHALL 支持源更正与删除，事务内失效全部自有 claim、capsule 与索引，并递增 generation。矛盾 SHALL 标记 unresolved 保留来源；明确取消计划 SHALL 标记原计划取消，不能报告完成；MUST 不覆写明确确认旧记忆。

#### Scenario: 更正删除与冲突
- **WHEN** 同槽用户报告不同值，随后更正/删除来源
- **THEN** 保留冲突证据，旧原话及其派生不能再召回，幸存来源冲突状态重新计算

### Requirement: 追加安全和容量
系统 SHALL 追加独立 schema，不修改已有 memory/events/usage，超容量显式返回拒存，不静默淘汰真实数据；MUST 不下载包、embedding、模型或发起额外模型调用。

#### Scenario: 旧库与容量
- **WHEN** 现有库增加互动记忆表且到达容量
- **THEN** 原记录不变，新摄入明确 capacity 提示，已有长期来源仍能检索
