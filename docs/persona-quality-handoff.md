# 人设与多轮验收接力

2026-09-30，本阶段基于 main `0868c88`。仅修改明确的人设、fixture、连续测试、报告和风格上下文问题；已完成 app-only 部署，待用户真实验收。

代码提交：`0351cf8847689212d9f2674f1d4287bda15528e0`，后续交接提交 `e2215c3`。补充用户原话“咱们项目的仓库”及指定 URL 的后续进度推送授权后，同一个 `git push origin main` 审批通过。已核对 GitHub `cloviszhu/Furina-1/main` 与本地均为 `e2215c3e87a7254ed8ca426fdb99d3e3fa9fe901`；此前 push 阻塞已解除，无目的地/通道变更或绕过。

## 已完成

- persona 原创概括：本人先回应、审美与意见、适度好奇心；减少简介式介绍、教师式共情、补景及重复舞台化。主线后非现任神明；传说任务前无神之眼/克莉奥经历，任务后不抹平压力。来源边界与人工标准见 [角色契约](character-contract.md)。官方 HoYoWiki 动态对白未完整返回，HoYoDex 是第三方转录，Honey Hunter 本次读取失败，不声称全部官方台词已核实。
- 六组三轮，最多十八次生成。身份组三种风格连续，组内真实沿用输出为 history，组间隔离。约定 fixture 是双方已同意周六海边柠檬蛋糕，未确认赴约；synthetic、评分说明只在 manifest/UI/报告。最后一轮清空临时历史，`persistence: not-tested`；没有保存检索，不能宣布跨会话记忆通过。
- 逐轮原子 reserve，沿用累计九元账本，无重试；一次失败立即停止。取消仍保留预留、在途互斥及迟到结果隔离。
- v2 安全报告完整记录实际 prompt、fixture、history、输出、usage/费用、风格与人工标准，十八行/512 KiB/100 文件上限；v1 六行报告仍可读，不迁移旧页报告、不自动删文件。没有 config/header/key/原始错误体。
- history/source 校验按同 timeline 兼容准确的三个旧 style 键。新事件用 timeline 键；不改写、不删除旧记录或已确认 memories，其他 timeline 的聊天隔离。已确认 memories 保留既有独立于风格的用户确认语义。若回滚到旧代码，旧代码不识别新 timeline 键，须保留兼容 reader，不能为回滚删记录。

## 验证

`npm test`：74/74，通过临时 DB、内存 DB 和随机 loopback 端口/fake provider。新增验证实际历史输入、十八次串行、组间清空、预算不足零 dispatch、一次失败停、取消无后续、style 切换前提保留、timeline 隔离、原记录无损、v1/v2 报告兼容与 allowlist。

`npm run build`：通过，仅既有 bundle >500 kB 提示。OpenSpec `persona-continuity-quality --strict` 通过。

独立 Edge Playwright remote-tests 检查十八轮、报告读取/下载、取消与在途刷新：通过。只访问随机临时端口的新浏览器，填入 fake fixture key；未访问旧用户页面。截图位于被 Git 忽略的 `artifacts/motion-review/batch-fixture-report.png`，不是实测角色验收证据。

## 实际部署与待用户操作

父协调明确授权本次受控部署后，先通过只读 `/api/status` 确认七条预算记录全部 completed、没有 reserved 在途记录，TTS active=false/pending=0；旧进程无 report/run 状态接口，未宣称直接读取其内存 run 状态。launcher 精确核实本项目绝对入口与 PID，随后 `stop --app-only` / `start --app-only`：app 从 `84100` 换为 `80944`，3000 ready=true、mode=offline（demo）。TTS `67988`/9880 未重启，ready=true。未操作用户浏览器、key、voiceprofiles 或正式聊天/记忆；预算只读核对，未重置。没有真实 API 调用。

部署后只读核对：`http://127.0.0.1:3000` 可用；测试 manifest 六组各三轮、十八 steps，最后一轮 `persistence: not-tested`。按钮为“启动自动测试（会产生 API 费用）”。预算仍七条 completed、reserve ¥0.46346、估算 ¥0.007372、剩余预留 ¥8.53654。报告列表接口返回零报告，读取一个不存在的合法 UUID 返回 404/仅 error 字段；未创建正式测试来伪造验证。临时 DB/随机端口/fake provider 的十五项针对性检查再次通过，验证实际组内 history、隔离、持久报告重读与无凭证 allowlist。声音只读健康，`furina-community-reference-test` 与 `ravdess-24-test` 可见，未删改。

父需说明用户刷新后看到新界面；用户自行安全刷新，再亲自填写 DeepSeek 配置/key，选择时间线与风格并点击收费测试按钮。key 不跨刷新保存；不从旧页读取或搬运它。新测试上限十八次，每次 128 输出 token，逐次遵守累计九元预留。没有主动刷新用户页或追加真实调用。

真实人设自然度、身份/时间线/捏造候选都待人工审核；模拟成功与 JSON 成功不表示人设过关。跨会话持久记忆仍未测。无模型、音频、权重、凭证或私密报告进 Git。
