# Spec Delta

## Purpose

让用户在本机与实际芙宁娜三维模型互动，通过持续待机、明确动作和可听见的语音获得即时反馈，同时明确区分系统声音与角色原声，保留后续替换表现和声音方案的空间。

## ADDED Requirements

### Requirement: Local model and motion

系统 SHALL 加载本地角色模型，显示加载或错误状态，持续待机与眨眼，并支持招呼和点头动作。缺少资产时 SHALL 显示安装指引而非假装加载成功。

#### Scenario: Model ready
- **WHEN** 用户打开本机页面且本地模型存在
- **THEN** 模型可见，待机与眨眼持续，点击招呼和点头产生不同动作

#### Scenario: Missing asset
- **WHEN** 模型入口不存在
- **THEN** 页面显示缺失提示和本地安装路径，仍可查看对话和记忆功能

### Requirement: Audible replaceable speech

系统 SHALL 提供可听见的 TTS，允许用户选择可用声音、试听与停止，说明系统声不是芙宁娜原声；播放期间 SHALL 驱动口型，停止和失败后恢复静止口型。不支持声音时 SHALL 告知错误。

#### Scenario: Speech playback
- **WHEN** 用户选择可用声音并触发试听或角色回复
- **THEN** 语音播放期间口型变化，结束后复位

#### Scenario: Interrupted speech
- **WHEN** 用户停止语音或开始新的回复
- **THEN** 旧播放取消，口型复位，新播放不会与旧播放叠加
