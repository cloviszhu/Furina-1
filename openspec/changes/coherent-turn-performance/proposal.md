## Why
现有原型以完整回复加单次音频为主，用户需要连贯、可中断且状态清晰的一轮角色演出。接口通或测试数量不能代替这一体验的验收。

## What Changes
- 增加兼容 JSON 的 turn/segment 合同与取消、错误、文本完成语义。
- 完整模型回复后有界确定性分句，第一句优先进入 TTS，不宣称模型流式生成。
- 保留显式付费授权、预算、凭据、SQLite、旧 persona 修复和生产服务。
- 为独立前端和自然互动记忆实现提供集成边界。

## Capabilities
### New Capabilities
- `coherent-turn-performance`: 单轮说话的有序段交付与取消边界。
### Modified Capabilities
无。

## Impact
server/index.js、server/turns.js、server/speech.js、合同文档和隔离测试；前端另支实现。无新依赖、额外收费或部署。多 idle/自然招呼和自然长期记忆仍需集成质量验收。
