# Proposal

## Why

用户实测指出角色介绍、共情与未知回答趋于普通助手，测试标签进入对白，风格切换丢失上下文。运输和 JSON 成功不能证明角色质量。

## What Changes

- 精简芙宁娜日常表达约束，保留主线后与传说任务前后事实边界。
- 六组各三轮受控测试，组内沿用实际回复，组间隔离；测试说明仅在 manifest/UI/报告。
- 报告允许审查实际 prompt、fixture、history、输出；持久记忆未经过保存检索则标未测。
- 同时间线共享风格历史，兼容旧键且不改写或删除原记录；保留时间线隔离。

## Capabilities

### New Capabilities

- `persona-continuity`: 人设表达、事实连续性、受控多轮验收与安全证据。

### Modified Capabilities

无已归档能力需要修改。

## Impact

persona/providers、memory/history、remote-tests/test-reports 与测试界面。沿用累计九元账本、逐次预留、取消和不重试策略。不调用真实 API、不部署、不调整音频或模型。
