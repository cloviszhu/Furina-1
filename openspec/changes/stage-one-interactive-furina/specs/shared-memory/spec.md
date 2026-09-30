# Spec Delta

## Purpose

让用户与角色建立能跨会话保留的共同经历记录，以可见来源区分已经发生的对话、用户明确保存的经历和模型推测，使后续回忆能够验证，并支持修正和删除错误记录。

## ADDED Requirements

### Requirement: Durable evidence-backed memories

系统 SHALL 持久化会话事件；用户明确保存的共同经历 SHALL 保留文字、时间与来源。系统 SHALL 展示记忆，并在服务重启后恢复。模型推测 SHALL 不自动写为共同事实。

#### Scenario: Restart and recall
- **WHEN** 用户保存一条共同经历后重启服务并查询相关内容
- **THEN** 该经历仍存在并可供回复引用，能查看它的来源与时间

### Requirement: Correct and delete memories

系统 SHALL 允许用户修改和删除共同经历，修改后旧内容 SHALL 不再作为当前事实检索，删除后 SHALL 不再召回该条目。删除 SHALL 同时清除其来源会话内容及相关衍生回复，避免后续短期上下文泄漏。

#### Scenario: Correct a detail
- **WHEN** 用户把一起吃的甜点从蛋糕改成布丁
- **THEN** 后续回忆使用布丁，并标明该条目已经修改

#### Scenario: Delete an experience
- **WHEN** 用户删除某条经历
- **THEN** 记忆列表和后续检索不再返回它及关联来源内容
