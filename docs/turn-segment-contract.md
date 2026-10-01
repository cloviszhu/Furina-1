# 一轮说话服务端合同

兼容已有完整 `/api/chat` JSON；每次显式发送仅一次模型生成，`stream:false`，不额外 LLM 调用或自动重试。改善完整回复之后首段 TTS 等待及后续合成/播放编排，不改善模型首 token 延迟，不称 LLM streaming。

## 接口

`POST /api/chat` 保留原字段，加 `turnId: crypto.randomUUID()`。成功响应保留所有旧字段，增加：

```json
{
  "turnId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "generationState": "completed",
  "delivery": "full-reply-segments",
  "segments": [
    {"segmentId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:0","index":0,"text":"第一句。","emotion":"calm"},
    {"segmentId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:1","index":1,"text":"然后继续说。","emotion":"calm"}
  ]
}
```

UUID 归一化为小写。段索引从 0 连续递增，最多 10 段，每段最多 300 UTF-16 单元，总文本最多 1500；拼接严格等于 `assistant.text`，情绪来自安全验证后的现有合同。第一句单独保留，后续短句合并以限制 TTS 次数。旧调用不带 turnId 时保持原响应。

`POST /api/speech` 原语音字段加 `turnId,segmentId`，两者须同时提供。text 必须与该段完全相同，emotion 若传递须相同。仍返回 WAV。只取当前轮的段，前端可预取后一段，播放必须按 index 串行并在开播时检查当前 generation。

`POST /api/turns/<turnId>/cancel` 不要求 body，成功 `{turnId,generationState:"cancelled",cancelled:true}`。重复取消安全；先取消后发同 UUID 也拒绝，避免 HTTP 竞态。新发送/恢复使用新 UUID。

## 状态与取消

前端状态：idle → thinking → preparing → speaking → idle；失败进入 error，取消同步清空队列、停止当前音频与动作、回到 idle，再发送服务端 cancel。generationState completed 仅指文本完整生成，不代表演出完成。模式/角色切换应执行同一取消路径。已有 AbortController 和 generation guard 必须保留。

取消或断开生成请求：abort 传至模型；即使模型忽略 abort 并迟到成功，也不得写历史或送回结果。已开始的收费预留不能因取消退款，预算记录仍保留，远程互斥锁直到真实请求 settle 才释放。取消已送达回复停止音频，不删除有效对话；未送达失败/取消不会自动形成记忆。

取消传至 GPT-SoVITS 和 Windows SAPI 合成；即使后端忽略 abort，迟到 WAV 也不得送出。前端同样丢弃迟到 blob，并回收对象 URL。TTS 失败不影响已成功生成的文本历史，可显式重播；禁止自动降级伪装为成功语音。

错误：409 TURN_CANCELLED / TURN_EXISTS / TURN_EXPIRED；400 INVALID_TURN_ID / INVALID_SEGMENT；502 TURN_PROVIDER_FAILED / TURN_OUTPUT_LIMIT / TTS_FAILED；429 TURN_CAPACITY。非 2xx 停止本轮排队。安全边界此前拒绝的请求可能只有旧 error 字段，前端不能依赖错误 code 总存在。暂存最多 128 轮，非生成轮次 30 分钟过期；未知过期轮次不得合成。无真实密钥/secret 日志。

## 后续集成与产品验收

异常边界补充：新合同每轮最多两个在途音频请求、全局最多四个，同一segment重复在途返回409 SEGMENT_BUSY，容量不足返回429 SPEECH_CAPACITY。合成结束或失败后释放，可显式重播；取消不会提前释放尚未settle的SAPI请求。正在合成的turn不会被TTL移除，以便cancel始终能找到它。连续长空白导致不可朗读段时，生成返回502 TURN_OUTPUT_LIMIT且不提交历史。注册上限128包含取消预注册；满时429，不驱逐有效轮次来接纳陌生UUID。30分钟TTL在下次请求时惰性清理；攻击取消洪泛不能触发模型或预算，旧无turnId调用仍兼容。

自然记忆模块由独立任务提供。唯一接线点：构建 prompt 前 retrieve；成功轮次提交后 ingestUserTurn；纠错/删除影响 lineage 并递增现有 contextGeneration，旧生成不得提交。不可把 assistant 文本、失败/取消轮次、角色虚构、secret 当用户事实；不增加默认收费调用。

一轮演出离线验收：顺序播放、生成取消、合成取消、模式切换、忽略 abort 的迟到结果、TTS 失败、恢复、历史/记忆隔离。前端与记忆分支尚需统一集成和浏览器验证。多自然 idle、协调招呼、姿态过渡、互动中自然形成/筛选/召回长期记忆仍为核心产品质量项；本合同不等于产品完成。真实声线、真实角色回复及人工自然度留待完整里程碑后的单次集中验收。
