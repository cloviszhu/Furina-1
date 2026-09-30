## Context
既有模型完整 JSON 回复、abort/generation guard、显式 DeepSeek 发送、20 秒模型期限、128 输出 token 预算和 SQLite 事件底座保留。D_sakiko 仅借鉴编排思路，不搬用代码；其本地模型也 stream=False。

## Goals / Non-Goals
实现一次生成、有界段交付、跨生成/合成取消和明确失败。不引入 SSE，不调整默认自动调用，不部署；编排完成不意味着产品完成。

## Decisions
详见 docs/turn-segment-contract.md。客户端 UUID 保留 HTTP 取消先到的 tombstone；进程内最多128条/30分钟过期。取消后真实收费请求 settle 前继续互斥。安全验证全部完成才分段，一段不超过300且不拆 surrogate pair。第一句独立，后段合并限制请求次数。TTS 失败不写伪造模型回复。

## Risks / Trade-offs
完整模型等待未缩短；首句长度决定第一段 TTS 成本。进程重启后旧段不能重播，需新轮。成功文本已交付时取消演出保留有效历史，不能拿播放完成当记忆形成触发器。自然记忆模块另线实现，需在成功 commit 后捕获和 prompt 前检索，并统一纠错失效。

## Migration Plan
无 turnId 的旧接口兼容。前端分支逐步启用 turnId/segmentId 和统一取消路径，独立端口、临时 DB、fixture 音频验证后父线程安排部署。

## Open Questions
真实角色与声线自然度仍需完整产品阶段的集中人工验收；多 idle/协调招呼与自动长期记忆筛选效果不能由离线测试替代。
