# 正式真实聊天流程交接

2026-09-30，基于 main `619d028`。仅实现、隔离审核及推送，未部署新版本。

## 使用流程

在主聊天点“聊天配置”，选择 DeepSeek、模型和 input/saved 密钥来源。建议按钮明确应用已验证的 `deepseek-flash` 和官方端点；未点击时保留自定义模型。配置和密钥来源枚举偏好可复用，收费开关仅存在当前页面。本人点“启用真实聊天（发送会收费）”不请求、不读 key；之后每次点收费发送或 Enter 才授权一次真实调用。快捷提示只填字。刷新回演示，需本人重新启用。旧单次测试与十八项测试仍保留。

主界面显示模式、配置模型、累计 9 元上限、预留和剩余预算。演示强制 offline，不因设置 provider 自动访问本地或远程模型。真实聊天仅允许官方 HTTPS DeepSeek，其他付费服务仍禁用。模型价格白名单、24 小时核实期限、128 输出 token、16000 输入字节、十倍安全预留、失败保留费用和无自动重试逻辑未改。未知自定义模型不会被偷偷替换，但原有预算价格白名单仍可拒绝该模型。

取消、切模式、上下文失效或刷新传递 AbortSignal；服务端取消后不写用户/assistant 历史。已派发请求可能计费，预留不退。客户端防连击，瞬间失败也保留 500 毫秒的本次发送窗口；服务端串行拒绝重叠的真实聊天/单次测试，在拒绝并发前不读凭据。仅旧的直接本地 API 调用仍保留并行行为供既有上下文测试使用。正式真实聊天失败明确报错，不以演示回复代替、不写历史；预算随错误和请求结束刷新。

密钥依旧走已审查的固定 Windows CredMan 与 official endpoint 路径，本轮未改 `server/credentials.js` 或 C# bridge，没有新秘密存储。只记住 input/saved 偏好，不是读取凭据或恢复付费授权。消息保存共同记忆继续使用服务端生成的用户 source；模式切换保留所选 source，保存前仍核验失效。

## 验证与证据

- `npm.cmd test`：97/97 通过，含新隔离 HTTP mock 测试；覆盖未授权、其他 provider/loopback 拒绝、凭据边界、重复请求、取消、失败预算、来源与预算耗尽。
- 最终单元日志：`artifacts/explicit-chat-mode/unit-test.log`；浏览器日志：`artifacts/explicit-chat-mode/browser-test.log`。
- 浏览器测试均使用临时数据库、随机端口、mock provider / mock CredMan。新流程验证演示默认、明确启用不读 key、不调用、快捷填字、每次发送、保留 v4-pro 自定义模型、失败无重试、取消、切模式、刷新和记忆来源。回归用例改为测试新源码的隔离 Vite 服务，不依赖生产 dist。
- 审核构建命令为 `npm.cmd run build:review`，输出到 `artifacts/explicit-chat-mode/build`；保留既有 bundle 超过 500 kB 提示。
- OpenSpec `explicit-chat-mode` 严格校验通过。`src/stage.js` 未修改。
- 本地 mock UI 截图：`artifacts/explicit-chat-mode/mock-real-chat.png`，仅 fixture 对话和预算；截图为加速阻断角色资源，没有代表生产角色加载故障。

首次误用默认 `npm.cmd run build` 曾短暂覆盖生产读取的 dist，已恢复原 HTML/JS/CSS 并移除本次多余 bundle。恢复后的 SHA256 与既有部署记录一致：HTML `f8cd9f973b393b84e80f478f6a542a6db8abb16cade1f5136908af156758e607`，JS `9c21c20e6d91931f2ee82fcb61463f086b1a70d8db0e3d31c702b01eacad99b9`，CSS `06b3ef903857f7d41aea4ca4acb991e2cd0c83bd3ae0e2dac5b095734c7d0b09`。app PID69452、TTS PID67988 未停/重启，未操作生产数据库，未刷新用户页面或访问真实凭据。后续审核构建输出隔离目录。不能证明短暂覆盖窗口内用户没有自行刷新，因此不声称过程中 dist 从未变化。

## 人设边界与剩余验收

只加入一条无证据不得指责“反复失约、又缺席、总是找借口”的约束，单元断言该约束存在。它是提示边界，不保证模型绝不违规，未再次进行付费人设验收。

继承只读任务已核验的事实：19:03:28 独立真实召回蓝莓小蛋糕/明天湖边散步，performer 只有本次问答，无旧答案污染；本任务未重跑。用户提供最新生产账本为 44 completed、reserve 4.27920，本任务没有追加任何真实调用，也未读取生产账本核实。

新正式聊天流程的真实模型端到端验收与部署尚未执行。取消不能承诺上游撤销计费。仍沿用 timeline 作为历史隔离方式，没有新增“清空会话”功能。小屏布局及真实 TTS/角色联动没有新增全套验收，既有相关单元回归继续通过。
