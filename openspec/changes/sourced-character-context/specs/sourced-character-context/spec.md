# Spec Delta

## Purpose

为角色互动提供有来源、固定剧情阶段和知情拥有者的确定性知识检索。将官方事件、角色理解及用户互动明确分开，检索在相关度计算之前阻止未来事件与未知私密知识进入模型上下文，同时保持严格总量预算与可核验的来源状态。

## ADDED Requirements

### Requirement: 来源与版次
系统 SHALL 精确选择 canonEdition，默认 4.2；只有 enabled 且 sourceStatus 合格的条目可入上下文。官方托管转写 MUST 与 primary-verified 分别标记；pending、secondary-only 及无法读取的来源不得冒称官方核实。

#### Scenario: 未核实关键剧情
- **WHEN** 默认包中的获 Vision 条目只有二手证据
- **THEN** performer 和 aftermath 均不得取出该条目，测试 fixture 不计入启用真实来源数。

### Requirement: 剧情与知情过滤
系统 MUST 在排序前检查 eventAt、knownFrom、知识拥有者及 public/private。公开或作者已知不能推导芙宁娜知情；publication 不得作为剧情发生时间。

#### Scenario: 精确查询未来事件
- **WHEN** aftermath 精确查询已核实且 eventAt=performer 的演出或 Vision
- **THEN** 不返回该条目；performer 只有在其拥有者已获知时才能返回。

#### Scenario: 私密对话
- **WHEN** 芙宁娜查询仅 Focalors 与 Neuvillette 拥有的私密对话
- **THEN** 不返回该条目，即使作者视角存在此知识。

#### Scenario: 后来发布的旧事
- **WHEN** 来源页面后来发布但证据记录的是较早已发生且已知事件
- **THEN** 使用事件时间和获知时间判断，而非 publication。

### Requirement: 知识语义隔离
系统 SHALL 分离 canonicalfact、characterinterpretation、userinteraction。用户事实报告、计划和角色推测 MUST 保留标签，不覆写 canon，不将解释升格事件。

#### Scenario: 用户提出互相矛盾的说法
- **WHEN** 用户报告与 canon 冲突，另提交未来计划与角色推测
- **THEN** canon 内容不变，三项互动分别标记为报告、计划、推测，计划不等于已完成事件。

### Requirement: 确定性与预算
系统 SHALL 按 topic/entity/alias/text 命中优先级与固定 id 排序，同输入同输出；maxRecords/maxChars MUST 对全部类别共享有界预算，整条输出，非法输入明确拒绝。

#### Scenario: 反序输入与小预算
- **WHEN** 相同候选条目以不同输入顺序提供，或字符预算不足容纳首条
- **THEN** 排序稳定，超预算条目整条跳过，modelPrompt 长度与所选总条数不超限。

### Requirement: 模型上下文最小投影
系统 MUST 只从已通过所有过滤且入预算的条目生成 modelPrompt，不能包含排除事实文本、剧透排除原因、未选来源说明或查询回显。无召回不可推断事实不存在。

#### Scenario: 未知与未来剧透
- **WHEN** 候选中有未来事件和不知情的私密事件
- **THEN** 所有返回的模型文本均不包含这些事实、标题、原因或审计元数据。
