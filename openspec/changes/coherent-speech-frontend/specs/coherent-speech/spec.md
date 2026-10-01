# Spec Delta

## ADDED Requirements

### Requirement: 一轮真实状态
系统 SHALL 显示 idle/thinking/preparing/speaking/error 对应的真实阶段，模型等待 MUST 不称 listening。speaking SHALL 由实际音频起止确定，静音间隙不退回 idle。

#### Scenario: 完整回复后分句
- **WHEN** 完整回复返回并自动朗读
- **THEN** 显示准备声音，逐短句按序发声，不声称 LLM token stream

### Requirement: 同步与取消
字幕、情绪及应答动作 SHALL 跟随当前音频片段实际开始，停止 SHALL 同步清除字幕口型及动作并拒绝迟到数据。

#### Scenario: 迟到合成
- **WHEN** 停止后旧合成忽略取消并返回
- **THEN** 不播放旧音频，不改变新轮状态

#### Scenario: 模式与刷新
- **WHEN** 切换模式或刷新
- **THEN** 当前模型等待、合成、队列及播放全部取消，不自动发送收费请求

### Requirement: 失败恢复与既有边界
失败 SHALL 显示真实错误并允许下一轮。声线 preferred/effective、删除恢复、显式收费发送与预算、记忆历史及双形态 MUST 保留。

#### Scenario: 下一句失败
- **WHEN** 下一句合成失败
- **THEN** 当前句结束后进入 error，停止后续队列，下一轮可恢复

### Requirement: 协调姿态与视觉验收
舞台 SHALL 提供多个有停顿的自然 idle 与协调招呼，头肩躯干手臂视线一起过渡；脚根 SHALL 保持落地，取消 SHALL 平滑收回。动作质量 MUST 经双 PMX 实际视觉对照，不以关节角测试替代。

#### Scenario: 双形态与打断
- **WHEN** 两种 PMX 演示 idle、招呼和中途取消
- **THEN** 保存本地视觉证据并报告观察到的僵硬、穿模或限制；未通过自然度验收不得宣称完成
