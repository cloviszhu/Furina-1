# Project Exo · 第四阶段交接

2026-09-30。本阶段已完成可交接的产品入口，停止继续加功能。用户总授权截止 **14:30 UTC / 多伦多 10:30**；本交接不延长时限。当前唯一主工作树 writer 已收口，无子代理。

## 当前结果

- 普通权限 `npm.cmd run local:start / local:status / local:stop`，不下载、不提权、不改执行策略；核对端口、绝对入口路径、executable、PID/创建时间和健康标识。无关占用拒绝，冷启动收据避免重复实例。Windows venv 的 launcher PID 与实际监听 PID 不同，状态以监听 PID 为准。
- 本机两步 PCM16 WAV 导入：4 MiB、3–10 秒、格式/静音/削波检查、单声道 32 kHz 安全规范化、十分钟预览，填写权利/转写/语言/profile/speaker/emotion 后确认。同一 profile 的表达必须同 speaker；测试声线不可被入口覆盖。原子校验登记、TTS 忙时拒绝、无需重启切换、跨 tab 更新通知。
- 修复 review P1：JSON/fenced JSON 解码后再次拒绝当前 key，白名单输出/usage；假 unicode key 从回复、SQLite 和朗读回归通过。修复 P2：按 eventId+context 检查早期来源，十轮后保存正常，检查失败保留草稿。旧阶段修复保持。
- **52 unit / 13 Edge browser / build / 四个 OpenSpec strict**；真实 PMX、GPT-SoVITS 和 Windows SAPI 验证。目录 junction 越界读写回归通过。详细证据见 [第四阶段验证](stage-four-validation.md)。

## 启动与服务

用户入口：[START](../START.md)。应用 http://127.0.0.1:3000，TTS http://127.0.0.1:9880。当前 app PID **64356**、TTS 监听 PID **64412**；需接手时再次查 status，不盲信 PID。服务已由绝对入口工具干净重启，最后仅重载 app 使配置重定向防护生效；日志 `.runtime/services/`，无需托管 exec session。

旧 relative-path 手工服务无法证明工作目录，工具拒绝管理；用户需在其自有终端停止后迁移。当前实例已经迁移，重复 start 只复用。健康查询/进程操作若在 agent 沙箱被拒绝，普通本机终端运行即可；本阶段仅在沙箱外以普通用户测试，未提升 Windows 权限。

## 保留边界与下一步

当前聊天仍是有限规则演示；自然对话、真实模型 persona 一致性和持续成长未验收。没有自动模型事实写入，后续若设计提取只能生成待用户确认建议。

RAVDESS Actor24 仍为 CC BY-NC-SA 4.0 非商业测试声，**不是芙宁娜**。入口验证只用了合成 tones/既有许可测试音频；未代替用户导入角色录音，未获取网络角色音频，未训练。用户回来可自行选择有权使用的同说话人录音；真实角色相似度、听感、自然度、情绪稳定性留待人工验收。首版仅 PCM16 WAV；其他格式明确提示本机转换。preview 确认是用户声明，机器不能证明完整试听、授权或声纹身份。

密钥必须最后由用户本人填写；没有读取桌面 key、`.env` 或其他凭证。实际付费调用 **0**、预算 usedCalls/reservedCny **0**。DeepSeek 总 9 元、最多 3 次/128 输出 token；价格核实 2026-09-30 10:15 UTC，24 小时过期 fail closed，真实调用前应重核；其他远程 provider 仍禁用。没有新增大模型下载；RTX4060 Laptop 8GB / RAM16GB 继续复用既有资源。

模型/纹理/音频/权重/运行数据/secret/截图均忽略不入 Git。没有复制/fork D_sakiko，没有对私人账户发消息、充值、新凭证、接受待确认协议或改变安全设置。

Git：main，origin `https://github.com/cloviszhu/Furina-1.git`，禁止 force push。最终 checkpoint 见 `git log -1` 与验证文档；交接后核对 `git ls-remote origin refs/heads/main`。

历史：[第三阶段及更早交接](history/stage-three-handoff.md)、[第三阶段验收](stage-three-validation.md)、[角色契约](character-contract.md)、[本地 TTS](local-tts.md)。旧历史的 PID/状态不再是当前值。
