## Why
现有文字聊天缺少用户主动录音的本地输入渠道。已有文件 ASR 证据支持进入有界录音草稿阶段，但不能证明真人识别质量。

## What Changes
- 按键录音、本地 CPU 转写、可编辑草稿；发送仍须用户显式点击或 Enter。
- 有界二进制 HTTP、单任务、取消杀进程和临时文件清理。
- 不自动下载、云回退、常听、自动调用模型或写记忆。

## Capabilities
### New Capabilities
- `local-recording-draft`: 主动录音及本地转写草稿。
### Modified Capabilities
无。

## Impact
新增 server/asr.js 和 src/recording.js；最小 composer 接线。server/index.js 的路由注册由集成 owner 负责；本分支不部署。
