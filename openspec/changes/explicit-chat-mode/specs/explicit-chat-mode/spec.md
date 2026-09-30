# Spec Delta

## Purpose
让用户在主聊天界面明确选择演示或真实 DeepSeek 交谈，逐次确认发送行为并准确看见来源、等待、取消、错误及预算边界，减少反复进入设置且保留安全的凭据与记忆生命周期。

## ADDED Requirements

### Requirement: Explicit paid sends
系统 SHALL 默认演示，本人明确启用真实模式后每次发送 SHALL 单独授权；刷新、启用和快捷提示 MUST 不发送请求或读取密钥，其他远程服务 MUST 禁用。
#### Scenario: Enable and reload
- **WHEN** 本人启用真实模式或刷新页面
- **THEN** 启用不请求，刷新回演示，普通配置和密钥来源偏好可复用。
#### Scenario: Send and custom model
- **WHEN** 本人在真实模式发送
- **THEN** 调用官方 DeepSeek，明确收费按钮，保留本人自定义模型，建议模型只显式应用。

### Requirement: Cancellation and honest outcomes
系统 SHALL 防止重叠聊天，取消或切模式 SHALL 停止等待和丢弃迟到结果，真实失败 MUST 明确报错且不自动重试或写入演示回复。
#### Scenario: Cancel or double click
- **WHEN** 连击、取消或切模式
- **THEN** 不发生重复自动调用，取消回复不入历史，已预留费用保留。
#### Scenario: Budget and failure
- **WHEN** 预算不足或上游失败
- **THEN** 保持累计 9 元预算及输入输出限制，显示错误和最新预算，无自动重试。

### Requirement: Memory and persona evidence
系统 SHALL 保持用户消息来源的显式记忆保存与失效验证，人设 MUST 不无依据指责用户反复失约或缺席。
#### Scenario: Save source
- **WHEN** 用户选择消息并保存为记忆
- **THEN** 使用真实持久化用户 source，模式切换本身不改变来源。
