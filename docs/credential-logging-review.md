# Windows 凭据桥接日志风险修复

2026-09-30，基于 `8358e4f2da053c9ce67a87bff292ba7a54a13d4b`。父独立审查指出旧 PowerShell JSON cmdlet 管道可能泄漏密钥，本轮采用假 sentinel 复现并最小修复。所有真实凭据读/写/删除仍未执行；没有部署、刷新用户页、修改生产数据、收费调用或日志/安全持久策略。`src/stage.js` 未修改，动作任务保留给独立 worktree。

修复代码提交：`9819185e53710981552422c743276bdae6fc5cc3`。后续仅任务完成/交接记录，最终 main SHA 以最终报告及远端核对为准；仍需父独立复审后再部署。

## 风险结论

**风险成立，旧版不能作为已通过安全审查的凭据实现部署。** 原脚本将 `[Console]::In.ReadToEnd()` 送入 `ConvertFrom-Json`，将带 key 的 result 送入 `ConvertTo-Json`。私有 stdin/stdout 和 `-NoProfile` 不阻止 PowerShell 对 cmdlet 管道记录模块日志或 transcription。

微软官方 [about_Group_Policy_Settings](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_group_policy_settings?view=powershell-5.1) 说明模块日志记录 pipeline execution events，transcription 捕获命令输入/输出；`LogPipelineExecutionDetails` 可只在当前 session 启用。先前只检查 stderr/argv/项目文件未覆盖这条系统日志路径，相关安全结论由本修复替代。

## 最小代码修复

- `scripts/windows-credentials.ps1` 只用 Add-Type 编译固定 C# 源码，调用 **无参数、返回 void 的 `[ExoCredentials]::Run()`**。生产脚本不再含 JSON cmdlet、`$inputData`、`$result` 或任何 PowerShell 密钥变量。
- C# 使用本机 .NET Framework 的 `System.Web.Extensions` / `JavaScriptSerializer`，在内部完成 8192-byte 有界 UTF-8 JSON 解析、类型/字段校验、2560-byte key 校验、现有固定 Cred API 和结果序列化。
- 承载 key 参数的 Execute 改为 C# 私有方法，生产 PowerShell 唯一调用入口为无参数 Run；测试仅在替身代码中开放旧入口用于对照。
- C# 直接用 `Console.OpenStandardInput()` / `Console.OpenStandardOutput()` 访问私有 OS 管道，**不调用 PowerShell Host/输出管道**。异常在 C# 内部捕获，只输出安全错误，避免秘密出现在 PowerShell ErrorRecord；临时输入/输出 byte[] 清理。
- `server/credentials.js` 更新边界说明，原来的官方 DeepSeek read 前门禁、固定 target、本机用户持久、禁止覆盖/明文回退及 API 不返回 key 都保持。
- 不关闭 transcription/module/scriptblock logging，不改注册表、组策略、执行策略或管理员权限。静态源码仍可被日志记录，但源码不含实际 key。

## 假密钥隔离证据

`tests/windows-credentials-logging.test.js` 在启动进程前移除所有 DllImport，替换完整 CredRead/Write/Delete/Free。读 sentinel 在 C# 内随机生成，保存 sentinel 只经 stdin 传入，不放 argv。使用独立 fixture mutex，不与生产凭据桥接互斥。

测试明确在 fixture session 导入 Utility 模块并启用 `LogPipelineExecutionDetails`，启动只写临时目录的 transcription，结束后仅停止自己启动的 transcript。**没有改变持久日志/安全策略。** 模块日志在 fixture 进程退出后读取，查询严格限定该子进程 PID、进程开始/结束时间和日志事件 800/4103；返回仅布尔/计数，不读取或导出其他进程日志。旧路径用作泄漏阳性对照，修复路径使用同一桥接和 mock API。

本机实际结果（read/save 均有模块日志阳性控制）：

| 操作 | 旧版 transcript 含 sentinel | 修复 transcript 含 sentinel | 旧版模块日志含 sentinel | 修复模块日志含 sentinel |
| --- | --- | --- | --- | --- |
| read | 是 | 否 | 是（5 个选定事件） | 否（3 个选定事件） |
| save | 否 | 否 | 是（5 个选定事件） | 否（3 个选定事件） |

带假 sentinel 的损坏 JSON 也在内部安全失败：transcript 和限定模块日志都不含 sentinel，不向 PowerShell 创建包含输入的异常记录。

证据元数据仅存忽略目录 `artifacts/settings-persistence/logging-fixture-evidence.json`，不包含 sentinel、输入或日志正文。自己的临时 transcript 已清理；系统自行记录的假 sentinel 对照事件不删除。若其他环境无法访问日志或缺阳性控制，测试会明确注明模块证据不完整，不把无法观测解释为不泄漏。

协议测试另外覆盖合法 read/save、引号/反斜杠、2560-byte 边界、过长 key、非法字符、坏 JSON、8193-byte 请求、错误类型、非 save 携带 key 和任意 target 拒绝。原始 PInvoke 编译/layout 验证仍不调用真实 Cred API。

## 回归与后续

完整 Node 回归 85/85（无 skip），其中三项新增日志/协议测试；针对性隔离 Edge settings/remote-tests 2/2，涵盖普通配置恢复、mock 保存清空/删除、十八步报告、取消/刷新及预算边界；build 通过（既有 >500 kB 提示），OpenSpec strict 6/6。真实凭据库仍未使用，未声称实际 key 已保存，也未使用真实 API 来测试修复。

父需对修复提交重新审查再安排 app-only 部署。部署后真实保存依然须本人在「幕后设置 → DeepSeek → 本次输入」填密码框，点击「保存到本机 Windows 凭据管理器」。此次证明的是指定 Windows PowerShell 日志路径下的隔离 fixture；不声称抵御管理员、OS 级管道/内存抓取、同账户恶意程序或所有第三方监控工具。
