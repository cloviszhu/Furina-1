# 自然记忆与手动表达接线合同

已集成服务端，前端 owner 可立即接线；不需要逐条确认才形成成功用户 episode。

`GET /api/interaction-memories?timeline=aftermath&style=natural&limit=50&offset=0`

返回 `{items:[{id,eventId,turnId,text,contextKey,createdAt,updatedAt,revision,domain}],generation,hasMore}`。id 为 episode ID；PATCH/DELETE 使用 eventId。当前 timeline 内按 updatedAt 倒序；style 共享。limit 1–100，offset 0–100000。列表包含可管理的 fiction/uncertain 片段，默认真实事实检索排除 fiction/hypothetical。

`PATCH /api/interaction-memories/:eventId` JSON `{text}` → `{retained,episodeId,revision,generation}`；secret 修正删除旧来源，返回 `{deleted,retained:false,reason,generation}`，刷新列表。

`DELETE /api/interaction-memories/:eventId` → `{deleted,generation}`，幂等。

来源修删同步明确确认的同来源记忆，清除过时对话并使在途生成、音频失效；原 `/api/memories` 格式保留。最小控件为原文、时间/类别、编辑、删除。修删成功后取消当前演出并刷新历史、手动记忆、自动片段。非2xx显示失败，不丢编辑草稿。

`POST /api/speech` 的 turnId/segmentId/text/emotion 仍严格对应原模型段。手动表达额外传 `expressionMode:"manual", referenceEmotion:"happy"`。登记可用才采用，成功 WAV 的响应头为 `X-Exo-Emotion: happy`、`X-Exo-Expression-Mode: manual`；舞台使用实际返回值。未登记返回400 `UNSUPPORTED_REFERENCE_EMOTION`，字段无效400 `INVALID_REFERENCE_EMOTION`，不假装采用、不静默fallback。reply模式省略referenceEmotion；已标注的neutral fallback可省略emotion，响应头确认neutral。系统声实际响应始终neutral。

chat 保留旧 recalled `{id,text}` 数组；新增 memoryCapture（成功来源捕获结果）和 memoryEvidence（有来源检索capsule、generation及有界预算信息）。只有成功用户内容捕获；assistant、失败、取消、secret不成为自动事实。一次LLM调用，追加检索预算仍受原DeepSeek输入/输出和费用限制。
