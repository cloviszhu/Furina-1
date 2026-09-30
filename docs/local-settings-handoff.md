# 本地设置持久化与凭据入口交接

**2026-09-30 独立审查修正：旧 PowerShell JSON cmdlet 管道存在已用假 sentinel 复现的系统日志泄漏，不应部署旧版。当前修复将全部秘密处理移入 C# 无参数 void 入口；完整阳性对照、范围和待复审说明见 [凭据日志修复](credential-logging-review.md)。真实保存及生产部署仍未执行。**

2026-09-30，基于完整 SHA `3f4fdef5b722c7377d516ecefcdafb3899956322`，main / `cloviszhu/Furina-1`。用户原话「每次都得填配置，好麻烦啊」，同意普通配置自动保留和本人首次确认的 Windows 凭据管理器入口。代码及隔离验证已完成；未执行真实保存，未重启生产 app/TTS，也未刷新用户页。代码提交 `076c61fa9f51c3d6e79cfd7c2c0a7349ecbf4d63` 已通过同一 `git push origin main` 推送，并用 `git ls-remote origin refs/heads/main` 完整 SHA 核对一致。后续仅交接/任务勾选提交，最终 SHA 以最终报告和 git 为准。

## 非敏感配置

`src/settings.js` 在当前浏览器、当前 origin 的 `project-exo.settings` 保存 version=2 白名单：provider、模型名称、无凭证 HTTP(S) baseURL、稳定的项目 neural profile ID、emotion、0.7–1.3 speed、timeline、style、expressionMode。不会保存 API key、credentialSource、私有聊天、预算或收费开关。系统/浏览器临时声音索引不作为稳定身份恢复；自动朗读开关不持久化。

provider/timeline/style/emotion/expressionMode 校验枚举；模型名称限制为标识符；端点拒绝用户名/密码、query、fragment、未知路径、secret 标记及当前输入密钥。允许标准根路径、/v1、/api、/api/paas/v4。未知版本、超过大小上限、损坏 JSON 安全回退；v1 只迁移已知字段。存储不可用时显示未保存，无文件回退。选择已删除/不可用 profile 时延续既有可用神经声线/neutral 回退，不自动启用系统语音。

启动时先恢复 timeline/style 再读取历史。风格切换仍沿用同时间线，时间线切换隔离历史；原始事件、记忆和预算均不改写。已测试模型/地址、Furina profile、calm、1.2 语速、reply 表达、performer/quiet 刷新恢复，密码框为空，无模型调用。存储键及 API 响应没有假密钥。

## Windows 凭据实现与审查入口

- `server/credentials.js`：固定 target `ProjectExo/Furina-1/DeepSeek/APIKey/v1`；保存/删除/状态包装，安全错误枚举与数值原生码；已保存密钥读取前验证 provider=deepseek、origin=`https://api.deepseek.com`、path=/ 或 /v1（可尾斜杠），拒绝 userinfo/query/fragment、loopback、其他服务和域名。客户端不能传 target。
- `scripts/windows-credentials.ps1`：本机已安装 Windows PowerShell + checked-in C# PInvoke，直接调用 Advapi32 的 CredReadW/CredWriteW/CredDeleteW/CredFree；不枚举，不下载 helper，不提权或改变执行策略。CRED_TYPE_GENERIC=1；CRED_PERSIST_LOCAL_MACHINE=2，当前用户此电脑跨登录持久，无 Enterprise 漫游。
- 命名 mutex 序列化本项目桥接；固定 owner 标记不匹配则拒绝读取/删除，任何已存在条目都不覆盖。更换必须由用户先明确删除。API blob 上限 2560 字节，密钥限定非空可见 ASCII；原生 blob 校验、CredFree 和临时 blob 内存清理均覆盖。
- 子进程 argv 只有固定代码；密钥只经私有 stdin 管道，不放 env、命令行、临时文件。read 的 stdout 仅供后端内部消费，绝不回浏览器/报告/日志；stderr 和异常原文丢弃。系统不可用或失败只返回安全码，禁止明文回退。
- `server/index.js`：固定 `/api/credentials/deepseek`，状态只有 available/saved 布尔。路径/查询/额外字段、Host、Origin、Sec-Fetch-Site、X-Exo-Credentials、精确 JSON Content-Type 和 confirmed 防护；保存/删除明确用户操作。已保存 key 的 chat/start/step 同样要求敏感请求头/Content-Type，失效或取消 step 在读取前拒绝。
- `src/main.js` / `index.html`：密码框、明确「保存到本机 Windows 凭据管理器」、删除确认及本次输入/已保存选择。成功清空密码框；凭据状态仅在打开设置时核对。刷新默认回本次输入，需要选择使用已保存密钥，选择不会触发收费。
- `src/remote-tests.js`：在用户一次启动的既有十八步串行流程使用后端读取的 key；关键配置和凭据操作在运行时禁用，仍一次失败/预算不足停止、无重试、取消保留预留。保存凭据不启动任何测试。

微软官方依据：[CredWriteW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew)、[CredReadW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw)、[CREDENTIALW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)。CredWrite 会替换已存在目标，所以本项目显式拒绝覆盖；LOCAL_MACHINE 是同用户本机跨登录持久，不是全机所有用户共享。同账户其他程序可能访问凭据，UI 明确不承诺绝对不可读。

## 已完成验证

- `npm.cmd test`：82/82，无 skip。新增 settings、credentials 和 Windows native fixture 测试，覆盖枚举/端点/版本/损坏回退、来源/Host/Content-Type、固定目标、官方端点先于读取、2560-byte cap、原生错误及不可用、已有凭据不覆盖、无明文 fallback、已保存 key 的十八步/预算/报告和原文/Unicode/JSON/fenced 回显拒绝。其余 persona、memory、motion、reports、TTS/import/deletion 边界继续通过。
- Windows 原始 PInvoke C# 在本机 PowerShell 编译并校验 native struct layout；**没有执行任何真实 Cred API**。操作分支采用 managed native-API 替身验证，包含 save/read/status/delete、FOREIGN/EXISTS/NOT_FOUND、字节上限和 1312 原生错误码。替身测试启动前强制不存在 DllImport。
- 隔离 Edge Playwright 六文件 15/15：journey、motion、reference-import、remote-tests、settings、stage。全部独立临时 DB/随机 loopback 端口/mock credentials；未运行依赖正式 3000 的旧 speech/local-tts 浏览器验收脚本。fixture 截图 `artifacts/settings-persistence/fixture-settings.png` 已查看，只存本地且 Git 忽略。
- `npm.cmd run build` 通过，保留既有 >500 kB bundle 提示。`openspec validate --all --strict`：6/6。

## 生产边界与待本人操作

收尾只读 app `/api/health`、`/api/status`：app PID80944、ready=true、mode=offline，七条预算记录全部 completed，reserve ¥0.46346、remaining ¥8.53654；TTS ready=true、active=false、pending=0，`furina-community-reference-test` 和 `ravdess-24-test` 可见，未删改。TTS PID67988 来自交接，本轮未重新核实 PID：Get-NetTCPConnection 被当前环境拒绝访问，不提权重试。没有真实 API/收费、充值、重试、正式 DB 清理或预算修改；未读取桌面 key、用户密码框、.env、旧浏览器存储或私人聊天。声线精修继续延期。

build 更新了被 Git 忽略的 dist，但运行中的后端仍是原进程；父须独立安全审查并协调 app-only 部署，随后用户自行刷新，不能在未协调前代刷新或代点。

部署后用户路径：幕后设置 → DeepSeek → 本次输入 → 本人填 key → **保存到本机 Windows 凭据管理器**。成功后页面显示已保存、密码框清空；下次选择「使用已保存的本机 DeepSeek 密钥」。真实 CredWrite/Read/Delete、重登录持久及当前账户真实权限仍待本人验收，**不称实际密钥已保存**。保存不会测试 API。需要真实 LLM 验收时仍由本人点击一次收费测试，沿用累计九元/既有七条预留账本；请求成功不能当作角色质量或跨会话持久记忆通过。

模型、PMX、音频、参考文件、真实 key、SQLite、runtime 和 fixture 截图均未加入 Git；只提交源码、测试、OpenSpec 和文字说明。后续 parent 独立审查应重点看 read 前端点门禁、native stdin/错误处理、origin/Host/JSON 边界及不可覆盖路径。


Latest deployed integration (2026-09-30): see docs/local-deployment-2026-09-30.md. App PID85080; TTS PID67988 unchanged; code c7253c10cd0cc3c1be963968f9b149b672d37b2c. Real credential operations remain unperformed.
