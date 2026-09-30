# Proposal

## Why

系统声音不能满足用户对角色声线与情绪表达的首要需求。本阶段选择单一成熟本地 TTS 核心，先做资源与真实音频验证，再接入现有角色舞台。

## What Changes

- 在忽略的隔离目录部署官方 GPT-SoVITS v2ProPlus，保留依赖许可，不复制参考项目实现。
- 自写 loopback 适配器，通过获授权参考录音选择声音和表达，情绪字段与文本分离。
- 加入有界单任务队列、客户端取消/过期结果丢弃、资源和音频验证记录。
- 缺少许可明确的角色录音时，明确展示测试声线；记录部署障碍，不宣称芙宁娜相似度完成。

## Capabilities

### New Capabilities

- `local-expressive-speech`: 本机成熟 TTS、参考录音登记、情绪选择、取消与资源边界。

### Modified Capabilities

无；第一阶段规格仍在活动变更中，未归档为主规格。

## Impact

影响 server 的语音接口、src 的语音播放及设置、隔离 Python/CUDA 依赖、语音验收文档与测试。收费模型与私人凭证不涉及；已有记忆 review 问题记录并留给后续专门修复阶段。
