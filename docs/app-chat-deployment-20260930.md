# 正式聊天增量部署核验

授权范围：只更新本机 app，保留 TTS、数据和凭据；不刷新用户页面，不调用付费模型。基线正式聊天与动作集成为 `8209218`，回忆提示分支 `70b26ee9` 已审查并 cherry-pick 为 `7fdf53f`。提示仅替换一条无依据历史归因/感官补写约束，未做真实模型效果测试。

## 隔离验证

- `npm.cmd test`：107/107 通过，包含新增 7 项回忆请求构造测试。原正式聊天提示断言同步到新约束。
- `npx.cmd playwright test tests/browser/explicit-chat-tts.spec.js --workers=1`：1/1 通过（35.6 秒）。自动朗读保持开启，用延迟 mock 模型和 mock TTS、替代 AudioContext，在随机端口和临时 SQLite 中覆盖等待模型、TTS 生成两个阶段各自的取消、切模式、刷新，以及正常播放后停止。7 次模型、4 次合成全部是假调用，没有访问本机 TTS/真实密钥。
- 取消后故意释放不响应取消信号的模型/TTS double，验证没有迟到消息/播放。模型阶段历史为空；TTS 阶段文字此前已完成并保存，取消不会删除已完成文字，也不增加历史。刷新不会重发请求或恢复真实模式。首次测试在服务端收到断开前释放响应，产生包到达顺序竞争；修正为确认服务端 signal 已取消后再释放，并等待预算记录结算后断言，不修改生产代码。
- `npm.cmd run build:review` 通过，只写审查目录；现有 bundle >500 kB 警告保留。
- 旧版本 `619d028` 的运行时代码归档与旧 dist 已保存在本机忽略目录，隔离 health/status/static/demo 回滚 smoke 通过。回滚不恢复数据库，避免覆盖用户新数据。

## 部署与保留检查

部署前只读核验 app PID 69452、TTS worker PID 67988；无运行中测试、预算预留中的调用、活跃 TTS 或 app 客户端/外部连接。现有台账 44 completed、累计 reserve 4.27920 元。仅在最终安静检查通过后用既有进程身份校验 launcher 的 `stop/start --app-only` 更新 app 和 dist。

本机证据位于 `artifacts/explicit-chat-mode/deployment/`：`before/quiet/after.json` 记录 health、静态 SHA256、表行数/摘要、schema、报告摘要和预算；不会在文档中导出私人消息或凭据。`mock-tts-cancel.log`、`unit-incremental.log`、`build-incremental.log`、`rollback-smoke.log` 保存隔离结果。部署结果完成后补充在此。

2026-09-30 21:50:17 UTC：已部署运行时代码 `325314126d5404c0f2971c3daf2d2a53053a3d31`，同一 SHA 已通过远端 `ls-remote` 核验。app 新 PID **92240**，创建时间 `2026-09-30T21:50:15.0160510Z`，health ready；旧 app PID 69452 经 launcher 的路径/创建时间/health 身份确认后停止。TTS worker **67988** 未停止或重启。主聊天浏览器增量回归另 1/1 通过（33.1 秒，`chat-incremental.log`），验证显式启用、复用自定义模型/保存密钥源、每次发送、连击、失败无重试、取消、切模式、刷新和保存记忆来源；均为隔离 mock。

最终安静检查通过后才替换 dist，服务返回与磁盘及审查包三者逐字节 SHA256 一致：

| 文件 | SHA256 |
| --- | --- |
| HTML | `8a76e24e138f6404f326977997b00373f7e0a333074da415edeff04a64f69431` |
| `/assets/index-D9DDwwwa.js` | `4c4163b43971ffacec8859c8e63a2818f403a7f42f5bc524e3093ee8225ab1de` |
| `/assets/index-6cOOsfGq.css` | `e677c043902edd7e0b7c9e595ca4ea8bb7c23082bb0a74c4fbc1c7ebb56bcc61` |

前后 events 11 行、memories 1 行、remote_usage 44 行的全行摘要完全相同；schema、两份已完成报告、TTS 配置摘要、完整预算记录也相同。预算仍 44 completed、reserve 4.27920 元、剩余 4.72080 元。只做只读保留核验，没有拷贝/恢复数据库、读取凭据、调用模型、触碰 TTS 或操作用户浏览器。app 日志无启动错误。

回滚材料：`rollback/runtime-source.tar` 及已解压的 `rollback/runtime-source/`，`rollback/dist/` 和实际替换前移动保留的 `rollback/dist-pre-swap/`。如需回滚，应重新检查用户请求/测试/TTS 队列为空，再身份校验 app-only 停止，恢复归档的 server 代码与旧 dist，仅启动 app；保留当前 data 与 TTS。本次仅完成隔离恢复 smoke，没有对生产执行回滚。此后的交接文档提交不改变部署运行时代码。

## 维护与验收边界

价格校验固定于 `2026-09-30T10:15:00Z`，24 小时后（10 月 1 日 10:15 UTC）会阻止付费调用。应届时通过官方来源重新核价并审查更新，不能无依据延长有效期。

用户之后自行刷新页面，明确启用真实模式，再逐次发送；正式聊天的真实 DeepSeek、真实本地 TTS 和角色表现仍待用户操作验收。本次 mock 证据不证明模型会遵守新提示，也不承诺取消免计费。部署不会自动启用真实模式或发送请求。
