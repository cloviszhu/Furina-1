# 本地设置与动作集成部署记录

2026-09-30。设置安全复审通过的基线为 `a6eb5b40f6517927a3487a81fea5de18dbf6b6c7`。已审查动作分支 `3c238ae6ec58ad0348c093b8c7d463ed6876e033` 的全部四文件 diff 和验证文档；无冲突 cherry-pick 后主分支代码为 `c7253c10cd0cc3c1be963968f9b149b672d37b2c`，已推送并核对 `cloviszhu/Furina-1/main`。

## 部署和数据保护

部署前两次只读核对 app 健康、预算、报告摘要和 TTS 队列：旧 app PID80944、离线模式、七条记录全部 completed，TTS 无活动请求或队列。通过项目 launcher 精确核对 PID 与入口身份后，只停止本项目 app。

停止后收到动作合并指令，合并前的启动被自动审批拒绝，原因是最新指令要求先合并、回归、推送再部署。未换通道绕过；完成这些步骤后再由同一 launcher `start --app-only` 启动。

新 app PID **85080**，3000 listening、ready=true。TTS PID **67988**，9880 ready=true，未停止或重启。项目 rootId 与部署前一致。

部署后 `/api/status` 的完整安全预算对象与部署前逐字段相等：七条旧记录完整、usedCalls=7、reservedCny=0.46346、remainingCny=8.53654、限额9元。未新增用户调用、未重置预算或清除历史/记忆。Furina community reference 与 RAVDESS profile ID 均保留。只统计正式 SQLite 文件存在和大小，未查询私有聊天或记忆内容；未搬移数据、配置、模型、声线或音频资产。

## 验证证据

- 单元测试 **87/87**，无 skip，包含假密钥、native API 替身、日志泄漏阳性对照与修复回归；未执行真实 Cred API。
- 隔离 Edge 浏览器六文件首轮14通过、stage综合项触及45秒总时限（已走到形态切换后的阶段）；该项独立复跑使用90秒上限，实际12秒通过。最终15项均有通过结果，未声称首轮全绿。所有应用旅程用临时 DB、随机端口、mock credentials，不连接正式历史。
- 两形态实际 PMX 舞台对照通过，分别180秒加速60Hz模拟idle、连续招手、拒绝抢占、点头、取消恢复、倾听/说话、口型/表情和形态切换。脚部位置不变，无 pageerror；对照截图已检查。新增肘腕运动是约2.4–2.8度的小幅改善，不是最终自然度或真实显示性能验收。
- build通过，仅既有超过500kB bundle提示；OpenSpec strict **6/6**；diff检查通过。
- 正式已服务的 HTML、JS `index-BautWXUh.js`、CSS `index-C8Uueq6V.css` SHA256与本次dist逐一相等。
- 正式入口六项负向检查通过：缺显式请求头、任意target参数、跨Origin、错误Host、错误Content-Type、未确认保存，均在调用凭据桥接前拒绝。没有执行授权成功的凭据状态请求。
- 全新独立 Edge 上下文连接正式静态包，恢复 provider/model/baseURL、Furina声音profile、neutral情绪、1.1语速、reply表达、performer时点、quiet风格。重新加载仅测试自己的新页面，未刷新用户页面。所有凭据请求在浏览器内替身响应，历史/记忆读取替身为空；不发送任何写请求或付费请求。密码为空、密钥来源仍默认本次输入、无pageerror；测试自己的localStorage未触及用户现有浏览器存储。

本地忽略证据：`artifacts/settings-persistence/deployment-before.json`、`deployment-after.json`（仅健康、预算、哈希及计数）；`verify-deployment.mjs`；`artifacts/stage-softening/`。这些产物与模型、音频、DB、runtime均未进入Git。

## 首次本人保存与限制

用户打开 http://127.0.0.1:3000 的「设置」，选择 DeepSeek，选择「使用本次输入（刷新清空）」，在密码框输入自己的 key，再亲自点击 **「保存到本机 Windows 凭据管理器」**。成功后页面显示「已保存」并清空密码值；之后选择 **「使用已保存的本机 DeepSeek 密钥」**。刷新时来源默认回到本次输入，需要再次选择已保存来源。保存本身不启用收费模式，真实自动测试仍必须本人明确点击一次，并受既有累计9元边界限制。

只支持当前用户、本机持久的 DeepSeek 凭据，固定 target `ProjectExo/Furina-1/DeepSeek/APIKey/v1`，LOCAL_MACHINE非Enterprise漫游。已保存key仅能用于官方HTTPS origin `https://api.deepseek.com` 的允许path，验证在读取之前完成；自定义域名或loopback不可使用真实已存key。现有目标拒绝自动覆盖；必要删除须本人明确操作，删除本机凭据不撤销上游key。Windows同账户其他程序可能有访问能力，不承诺抵御管理员或操作系统内存抓取。

真实 CredWrite/Read/Delete、当前账户真实权限、跨Windows登录持久性及真实官方API调用均**未执行**，待本人首次保存和明确使用验收。不能声称实际密钥已保存。不可用或无权限时安全停止，不回退明文；密钥不回传浏览器、不进localStorage/项目文件/Git/report/log。

重点代码：[普通配置](../src/settings.js)、[设置交互](../src/main.js)、[凭据门禁](../server/credentials.js)、[HTTP边界](../server/index.js)、[无参数C#桥接](../scripts/windows-credentials.ps1)、[日志修复证据](credential-logging-review.md)、[舞台小幅改善](../src/stage.js)、[动作验证](stage-softening-validation.md)。
