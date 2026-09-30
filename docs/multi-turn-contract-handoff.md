# 多轮表达契约与认识边界交接

2026-09-30。基线 main `b3382e88d7721b583901af783e4eabb28b844fb6`，仓库 `cloviszhu/Furina-1`。本阶段仅主目录写入，无部署/服务重启/用户页面刷新/真实凭据操作/收费调用。

## 真实证据与根因

只读本地安全报告 `e0bffb29-5d4a-43fe-8215-92314ae69db8`，用户完成于 16:56:24–47 UTC，deepseek-flash。18 请求 completed，7 条 structured=true、11 条 false。7 个空历史回合均为结构输出，11 个带历史回合均丢失结构；后者 neutral 是 plain-text 回退，不能算成功情绪输出。最后新会话题 persistence=not-tested，仍不是持久记忆 bug 证据。

确定的实现缺陷：`messagesFor` 用 e.text 发回 assistant 历史，丢掉模型真实 JSON 外壳与 emotion；正式 SQLite 也只保存正文。第二轮开始出现纯文本 assistant 示例。DeepSeek 请求未启用 JSON 模式，解析允许纯文本作为完成回复。三者共同使多轮契约缺少约束并把协议缺失接受成完成。报告分组强烈支持历史格式为主要诱因，但未做收费 A/B 实验，不能声称已证明模型内部因果或真实修复成功。

官方 [JSON Output 文档](https://api-docs.deepseek.com/guides/json_mode/) 明确支持 `response_format: {type: 'json_object'}`，含当前 deepseek-flash 示例；同时说明空响应及截断仍需处理。本阶段仅查询公开文档，无模型调用。

记忆问题来自提示的不对称：强调“不编造发生过”，但未同等约束“不凭缺失断言没发生”，也没说明历史角色自己的推断不是证据。报告计划只说“尚未确认实际赴约”，角色却说“还没去成”；雪山缺依据却说“根本没和你去过”。这是认识边界与措辞问题，无需改写记忆数据库。

## 具体修复

- assistant 历史使用 JSON text/emotion。真实已知标签保留，旧历史未知用 null，提示明确它仅表示历史字段未保存，不是 neutral、也不是当前输出示例。user 内容仍是原话。
- events 添加可空 emotion 列；只保存 model-contract 标签，旧行不回填。remote mock/收费批次历史也保留真实 emotion；安全报告允许该字段，不新增秘密字段。
- DeepSeek 增加官方 JSON 输出模式，保持 thinking disabled 与 128 输出 token 上限；不猜测其他兼容提供商能力。其他服务的纯文本兼容仍显式标为 plain-text，不算 model-contract。
- DeepSeek 纯文本、空回复、截断或非法契约均为固定 `INVALID_EXPRESSION_CONTRACT` 错误，无 neutral 成功结果、无重试。聊天 502，不写正式历史、不朗读本地演示替代；批次一败停止，失败 emotion=null / structured=false / text=''。保留 allowlist 数字 usage、失败估算与预留，安全报告保留固定 errorCode，不保存原始失败内容或 provider error。
- 人设明确“未确认不等于未发生”“缺少回忆不证明从未发生”“旧自述不能自证”；给自然对白示例，不让普通对白播报数据库。允许用户明确提出的虚构故事，不能升级为共同往事。适度补充疲惫原因不擅断、无需每轮追问。

## 验证与边界

- Node：92/92，通过。涵盖 18 轮真实 mock 输出传递、第二轮协议失败停止、无重试、失败数字 usage、HTTP 不保存/不朗读回退、旧历史未知/新标签跨 SQLite reopen、timeline/style 连续与隔离、旧报告兼容、所有风格边界提示。人设提示检查只验证约束文本，不能证明真实模型遵守。
- build：通过。既有 bundle >500 kB 提示仍在，无新依赖。
- OpenSpec：`multi-turn-expression-boundary --strict` 通过，proposal/design/spec/tasks 已记录。
- 浏览器：3/3 通过（28.5s）。独立临时 DB、临时 loopback 端口、fake provider、fake credential bridge、新建 Edge 页面。覆盖第二轮协议失败、18 轮完成/取消/安全报告、普通设置刷新与风格上下文保存。
- 未打开生产页面，不触碰 3000/9880 生命周期；未读取 CredMan、key 文件、浏览器密码框或环境秘密。现有 data 台账/报告/记忆未写入；仅读取指定脱敏报告。

用户给出的历史费用保留为报告/用户证据：本轮输入10846/输出618，估算 ¥0.026636；累计25 completed/0 failed，估算 ¥0.034008，预留 ¥2.04470。本阶段无真实收费调用，未重写原台账或将这18次历史 completed 改为 failed。

## 父任务复审与真实待办

先复审并协调 app-only 部署，本阶段不部署。部署时才会对真实库进行可空列添加，不回填旧行；旧版本显式查询兼容此附加列。TTS 与用户页面交由父任务协调。

用户后续明确启动真实测试时，检查第2/3回合持续 JSON、真实情绪标签、未知计划/雪山措辞、施压后保持认识边界、明确雪山故事仍自然、疲惫回应与问句比例。JSON 失败应明确停止且不自动重试。跨会话持久记忆需另行真实验证，当前 fixture 仍 persistence:not-tested。不得把本地 mock 或提示断言变成真实角色质量通过。
