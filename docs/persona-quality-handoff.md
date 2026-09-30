# 人设与多轮验收接力

2026-09-30，本阶段基于 main `0868c88`。仅修改明确的人设、fixture、连续测试、报告和风格上下文问题；待父协调部署与用户真实验收。

代码本地提交：`0351cf8847689212d9f2674f1d4287bda15528e0`。目的地已按精确 URL 核实为 `github.com/cloviszhu/Furina-1`，但 push 未执行：自动审批先拒绝未核实 origin/main，核实后再次拒绝，理由是“私有仓库代码外传的目的地未被确认为受信任的组织仓库，即使一般 commit/push 授权仍不够”。没有尝试绕过；父协调需要处理该明确目的地的推送授权/信任条件，再推送和核对远端。OpenSpec 最后交付任务因 push 阻塞保留未完成。

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

## 待父协调

未重启 app84100/3000、TTS67988/9880；未刷新用户页、读取任何原 key、正式 DB 或旧报告；未产生真实 API。七次历史调用估算 ¥0.007372、reserve ¥0.46346 来自上游交接，本次未重新查询正式账本，也未重置它。

build 只更新磁盘 dist，现有页面未刷新；旧进程仍是旧 server。请保留用户旧页 key/报告状态后安排 app-only 部署，再由用户安全刷新并本人显式启动。新测试上限十八次，每次 128 输出 token，逐次遵守剩余九元预留，不能自动追加真实调用。

真实人设自然度、身份/时间线/捏造候选都待人工审核；模拟成功与 JSON 成功不表示人设过关。跨会话持久记忆仍未测。无模型、音频、权重、凭证或私密报告进 Git。
