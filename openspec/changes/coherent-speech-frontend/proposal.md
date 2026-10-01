# Proposal

## Why
现有等待状态误称 listening，口型推断播放阶段且表情动作在音频前发生。用户需要连贯、可立即打断的一轮说话及协调的多姿态，而非接口演示。

## What Changes
- 前端统一 turn 生命周期、短句 TTS 队列、字幕和实际音频起止同步。
- 停止、切模式和刷新作废整轮，失败可恢复。
- 检查双 PMX 后改进多 idle、招呼与有界过渡，用视觉证据评估。

## Capabilities

### New Capabilities
- `coherent-speech`: 一轮可取消的分句语音与协调动作。

### Modified Capabilities
无。

## Impact
src/main.js、speech.js、turn-lifecycle.js、stage.js、最小字幕样式及隔离测试。服务端归其他线程，已接其明确合同。不部署、不推 main、不访问真实模型或密钥。
