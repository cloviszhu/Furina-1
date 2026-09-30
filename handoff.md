# 当前交接

正式聊天流程已实现，尚未部署。详见 [正式聊天交接](docs/explicit-chat-mode-handoff.md)。默认演示，真实模式必须本人在主聊天启用；逐次发送收费，刷新回演示。新模式验证仅 mock，未重跑真实召回。

[2026-09-30 persistent memory save app-only deployed: app PID69452, TTS PID67988 retained; shortest real validation steps](docs/persistent-memory-deployment-2026-09-30.md)

[2026-09-30 persistent SQLite memory chain and mock request verification](docs/persistent-memory-handoff.md)

[2026-09-30 multi-turn contract app-only deployed: app PID78928, TTS PID67988 retained; real model validation pending](docs/multi-turn-deployment-2026-09-30.md)

[2026-09-30 multi-turn expression contract and epistemic boundary: mock verification and implementation](docs/multi-turn-contract-handoff.md)

[2026-09-30 local settings: implementation verified; app-only deployment and first real credential save pending](docs/local-settings-handoff.md)

# 第四阶段交接

最新服务、Git、截图和边界见 [docs/handoff.md](docs/handoff.md)，用户直接操作见 [START.md](START.md)。安全参考导入、普通权限服务管理与 review 修复已完成；真实 LLM、角色声线/人工听感未验收，密钥留待用户本人最后操作。


Latest deployed integration (2026-09-30): see docs/local-deployment-2026-09-30.md. App PID85080; TTS PID67988 unchanged; code c7253c10cd0cc3c1be963968f9b149b672d37b2c. Real credential operations remain unperformed.
# 2026-09-30 正式聊天已部署补充

运行时代码 `325314126d5404c0f2971c3daf2d2a53053a3d31` 已推送并于 21:50 UTC app-only 部署，PID 92240；TTS worker 67988 保留。已集成 persona 分支 `70b26ee9` 为 `7fdf53f`，没有真实模型效果复测。107/107 单元、两个新增/增量隔离浏览器回归通过，包含自动朗读开启的模型/TTS 延迟取消、切模式和刷新。health/审查包静态 hash/台账/数据/schema/报告/TTS 配置前后核验通过，44 completed、reserve 4.27920 元不变。没有读取凭据、付费调用或刷新用户页面。

详见 [部署及回滚核验](docs/app-chat-deployment-20260930.md)。用户下一步自行刷新，以演示模式进入，再明确启用真实聊天并逐次发送做模型/真实音频验收。价格有效期截止 2026-10-01 10:15 UTC；届时须官方重新核价，不能无依据延长。本段之后的旧交接记录保留作历史，涉及“未部署”的描述已由本段更新。
