# 连贯说话与自然记忆：本机发布记录

2026-10-01 UTC。独立复审 7533a02 通过后，父线程补充用户指定项目仓库和继续推进的原文授权。本次同一发布动作的授权证据重试获自动审批认可，随后才执行合并、推送和 app-only 更新；没有换工具绕过此前拒绝。

main 代码合并提交 `6bbed5e787847c79b192e905e58e42716db8b2ae`，Git push 明确确认 `07aa67b..6bbed5e main -> main`。审阅代码、合同及隔离检查见 [集成证据](coherent-milestone-evidence.md)，其中未部署描述为发布前阶段记录。代码基线 Node169/169、浏览器9/9、review build、OpenSpec14/14；本次没有因发布重复运行相同全量测试。

## 本机更新与保存边界

更新前确认 app PID74568 和项目 health 身份；TTS PID67988 ready、active=false、pending=0，预算账本没有 reserved 状态的未结算请求，3000无已建立连接。主目录没有 tracked 改动，仅保留未跟踪的 `.worktrees/`。合并仅涉及54个代码、测试和文档文件，无资产、秘密或运行数据库。

通过现有 `node scripts/exo-local.mjs stop/start --app-only` 更换 app；当前 PID101352、ready=true，TTS PID67988 ready且未重启。部署 dist 直接来自已验证的隔离 review build；index.html SHA256 与该构建一致。用户页面没有刷新或点击，用户凭据没有读取，未执行聊天/TTS合成或付费调用。

旧 dist 与 app 停止后的 SQLite 文件副本仅保存在本机忽略目录 `artifacts/local-rollbacks/coherent-20261001T003404Z`，不提交或外传。旧代码仍可按上面的07aa提交取回；备份包含真实数据，应保持本机私有。回滚需要重新确认空闲并获当前操作授权，不自动回滚或覆盖新互动。

## 只读部署核对

- 首页HTTP200，包含正式自然记忆容器和说话状态容器。
- 自动记忆管理API正常，当前0条、generation0；没有把旧历史补录为长期事实。
- 只查询SQLite行数核对：更新前后 events25、confirmed memories1、remote usage50一致；新表可用，test provenance列存在。未读取或输出事件/记忆正文。
- 预算 usedCalls50、reservedCny5.10934与更新前完全一致；没有新增API消费。
- 保留旧声线登记、SQLite、Windows凭据、预算与用户页面；不操作TTS资产或声线管理入口。

工程部署已经完成，不代表真实模型的角色稳定性、音色相似度、长期动作自然度或活人感通过。集中真实/主观验收仍由父线程安排，保留 [集成证据](coherent-milestone-evidence.md) 中的验收步骤与不足。
