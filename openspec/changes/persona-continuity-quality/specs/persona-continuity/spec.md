# Spec Delta

## Purpose

让用户能够审查芙宁娜在连续日常对话中的身份、时间线、语气和事实一致性，通过隔离的多轮测试获得真实输入输出证据，避免将请求成功或模拟验证误当作角色质量验收。

## ADDED Requirements

### Requirement: Character facts and expression

角色 SHALL 先回应用户当句话，保留审美、意见和好奇心；主线后不冒充现任水神，传说任务前不具备神之眼或克莉奥经历。风格 MUST 只改变表达。未知经历不编造，普通对白不播报存储结构。

#### Scenario: Style preserves facts
- **WHEN** 用户从自然交谈切到安静陪伴
- **THEN** 同时间线原历史继续可用，其他时间线历史不被召回，旧记录不删除

### Requirement: Controlled multi-turn evidence

测试 SHALL 六组各三轮、最多十八次生成，组内使用实际前轮输出，组间隔离。fixture MUST 将约定与履行、用户陈述与共同经历及故事区分；synthetic 元数据不得进入角色记忆文本。每次逐次预算预留、可取消、失败不重试，不写正式聊天或记忆。

#### Scenario: Agreed plan is not completed experience
- **WHEN** 测试追问海边柠檬蛋糕是否已吃过
- **THEN** prompt 仅包含已同意周六计划与尚未确认履行的证据

### Requirement: Honest review and safe reports

报告 SHALL 记录实际 prompt、fixture、history 和输出的 allowlist 字段，不含凭证、配置、headers 或原始错误。自动提示 MUST 不等于人设通过或硬失败裁决；跨会话未经历实际保存检索 MUST 标记未测。

#### Scenario: New session recall is not simulated persistence
- **WHEN** 演出组第三轮请求跨会话回忆
- **THEN** 新会话不注入前轮全文，报告明确持久记忆未测，人工审核仍待完成
