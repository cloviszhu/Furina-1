# 单轮服务端交接

分支 milestone/turn-segments；worktree artifacts/worktrees/turn-segments；基线70b3c3e。已主动读取07aa67be的AGENTS.md，遵守最新规则。合同见 [turn-segment-contract.md](turn-segment-contract.md)。

已实现兼容chat的UUID turn、有序有界segment、跨生成及合成取消、先取消后发送的竞态隔离、文本完整完成语义、安全失败、Windows SAPI取消以及原子提交user/assistant事件。纠错删除使已暂存turn失效。新合同模型失败不写离线替代回复。

验证：全量Node测试120/120通过，临时数据库/随机端口/fixture provider/伪造凭据bridge，未调用真实provider或真实credential API。最后纠错使turn失效补充后，相关turn+memory-context测试11/11通过；OpenSpec strict及git diff --check通过。全量运行约50秒，Windows fake bridge为其中较慢部分。现有凭据、预算、persona、SQLite迁移与旧调用均覆盖。没有触碰生产dist、运行数据、声线或TTS进程；未部署。

复现：在worktree执行 `node --test tests/turn-segments.test.js tests/memory-context.test.js`，或 `node --test tests/*.test.js`。无需密钥和用户手动API测试。

前端在feat/speech-turn-lifecycle尚未提交；自然记忆在feat/interaction-memory尚未交接，本次不搬运他人未完成文件。汇合后需要统一浏览器验收：第一段先出、顺序播放、生成取消、TTS取消、模式切换、迟到blob、故障恢复、历史与记忆不污染；接入自然记忆的prompt前retrieve/成功turn后ingest/纠错删除lineage。重播需要仍存活的turn；进程重启或30分钟过期后新轮发送。

产品限制：完整模型等待没有缩短；segment分句不是LLM streaming。多自然idle、协调招呼和自然形成长期记忆仍是核心，真实角色表现/真实声线/人工自然度仍未验收。由父线程在完整里程碑后统一安排部署和集中验收，不要求用户逐补丁测试。
