# Spec Delta

## Purpose
确保角色多轮对话持续携带可验证的表达契约，让未知经历保持未知而非肯定或否定，并使协议失败在界面中诚实可见，避免把自动回退标签或模拟结果当成真实模型与角色验收证据。

## ADDED Requirements

### Requirement: 多轮表达契约
系统 SHALL 保留真实历史表达标签，未知历史标签不得伪造。DeepSeek 请求 SHALL 使用支持的 JSON 输出能力，当前回复缺少合法 text/emotion SHALL 显示协议失败，无重试或成功情绪回退。

#### Scenario: 带历史的后续回合
- **WHEN** 发送第二或第三回合
- **THEN** 历史包含真实表达字段或明确未知标记，当前要求仍为完整 JSON 契约。

#### Scenario: 纯文本响应
- **WHEN** DeepSeek 返回纯文本而非契约
- **THEN** 显示失败，批次停止，不写入正式对话、不朗读演示回复、不自动重试，计费预留仍保留。

### Requirement: 认识边界
角色提示 MUST 区分已确认、未确认和明确否定；缺少回忆不构成未发生证据，历史角色推断不得自证。明确虚构邀请 MUST 允许创作且不升级为共同经历。

#### Scenario: 未确认赴约与未知雪山
- **WHEN** 计划材料仅未确认履行，或没有雪山经历证据
- **THEN** 提示要求自然表达无法确认，不断言未去成或根本没去过。

#### Scenario: 明确故事与疲惫
- **WHEN** 用户明确编故事或仅表达排练疲惫
- **THEN** 提示允许故事，避免擅自诊断疲惫原因或机械每轮追问。

### Requirement: 真实证据保留
系统 SHALL 保留既有报告与台账，跨会话 fixture 的 persistence SHALL 继续为 not-tested。

#### Scenario: mock 验证
- **WHEN** 执行本地回归
- **THEN** 临时数据与 fake provider 隔离真实数据和凭据，不将 mock 通过标作真实验收。
