# Spec Delta

## Purpose

完善本地数字芙宁娜的互动旅程，使剧情时点、回复来源、表达选择与故障处理均可见且一致；通过实际舞台和声音验证，与无需凭证的协议测试共同提供可复查质量证据。

## ADDED Requirements

### Requirement: Configurable persona and evidence boundaries

系统 SHALL 提供剧情时点和语言风格选择，在模型上下文中区分官方背景、用户确认的共同经历与主观感受；切换时点 SHALL 停止旧回复/声音，隔离短期会话。规则演示 SHALL 明示不具备真实推理能力。

#### Scenario: Change character context
- **WHEN** 用户切换剧情时点或语言风格
- **THEN** 后续上下文采用新配置，旧请求不展示或发声，共同经历保留为玩家记录而非原作事实

### Requirement: Separate reply text and expression

模型回复 SHALL 支持经验证的独立 emotion 字段，正文不朗读控制 JSON；纯文本兼容回复 SHALL 使用 neutral 并标注契约未提供。非法结构 SHALL 转为明确标注的演示回退，不把模拟输出称为真实情绪理解。

#### Scenario: Structured or legacy completion
- **WHEN** 提供商返回合法结构化回复或纯文本
- **THEN** 结构化回复分离正文与表达；纯文本仍可显示但表达保持 neutral，不添加朗读标签

### Requirement: Consistent speech and recoverable faults

系统 SHALL 在声线、表达、语速切换及记忆纠改/删除时停止旧语音；新回复 SHALL 使用当前声音与表达选择。后端/声音/资产不可用 SHALL 给出明确修复路径，系统备用声 SHALL 显式标注；角色声线相似度与人工听感未验证 SHALL 持续可见。

#### Scenario: Switch expression during synthesis
- **WHEN** 用户在生成或播放中改变表达
- **THEN** 旧音频不再投递，口型复位，下一次朗读采用新选择

#### Scenario: Memory mutation in another page
- **WHEN** 同一浏览器另一同源页面成功修改或删除记忆
- **THEN** 当前页停止旧回复与语音、使旧来源失效并刷新列表，通知不包含记录正文或密钥

#### Scenario: Missing service or asset
- **WHEN** 后端停止、参考未登记、声音缺失或模型加载失败
- **THEN** 页面说明对应修复步骤，聊天与记忆入口仍可用，没有静默声音替换

### Requirement: Reviewable journey and secret boundaries

系统 MUST 在无真实密钥下验证记忆纠改竞态、重启持久化、provider 协议、输入限额和预算拒绝；秘密 MUST 不进入回复/错误、数据库或浏览器持久存储，真实付费调用 MUST 等待用户亲自输入 key。

#### Scenario: Unsafe or over-budget request
- **WHEN** 跨来源、越界路径、超限输入或过期/耗尽预算请求到达
- **THEN** 请求在不授权外部调用的情况下拒绝，错误不泄露请求秘密
