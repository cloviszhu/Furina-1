# Project Exo · 第一阶段交接

2026-09-30 08:31 UTC 检查点。用户总窗口更新到 14:30 UTC / 多伦多 10:30 EDT；结束本阶段是接力，不是停止项目。

## 可运行状态

真实 PMX、待机/眨眼/招呼/点头、中文系统 WAV/振幅口型、文字输入/规则演示回复、本地持久共同经历/来源/纠错/删除已实现与实测。两份模型都加载通过。

自然对话、角色声线/真实情绪、自动长期经历提炼和稳定成长未完成。系统声只备用，不算最终声音交付。用户最重视声音，后继优先成熟 TTS。

普通用户环境服务运行在 **http://127.0.0.1:3000**，仅 loopback。最终重启后 exec 服务会话 ID 16061（可能不能由新 agent 直接操作），`/api/status` 已返回 200、两模型可用、预算用量 0。重启：

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

端口占用时先请求 `/api/status` 确认是本项目，识别本项目 PID 再停，不能泛杀 Node/浏览器。服务器代码变更须重启，前端须重建。受限沙箱 COM/WSH 可能失败，正常环境已验证，不改系统策略。

## 代码地图

`server/index.js` HTTP/本机边界；`memory.js` SQLite；`providers.js` 人设/规则/OpenAI-compatible/Anthropic/Ollama；`budget.js` 持久限额；`speech.js` + `scripts/windows-speech.vbs` SAPI WAV；`tts-contract.js` 能力边界。`src/stage.js` PMX/grant/动作，`src/speech.js` 播放/口型/取消，`src/main.js` 与 HTML/CSS 界面。

规格在 `openspec/changes/stage-one-interactive-furina/`；实际验收见 `docs/stage-one-validation.md`，声音接口见 `docs/speech-adapter.md`。检查 README 获得完整资产/启动说明。

## 实测与资源

11/11 Node 测试、构建、2/2 浏览器测试（无跳过）、OpenSpec strict validate 通过。实际 skinned vertex 动作、主/荒模型、桌面/移动、真实 WAV 与振幅口型/取消均验证。JS 735 KB / gzip 210 KB，包拆分待优化。图片只在忽略目录 `artifacts/`，不能上传。测试经历已删除；真实远程模型调用 0，未读取密钥文件。

工具：Git 2.55.0、Node 24.19.0、npm 11.17.0、OpenSpec 1.13.1。GPU RTX 4060 Laptop、8188 MiB、驱动 610.88，曾测占用 2345 MiB；RAM total 15.7147 GiB / 曾测 free 3.7478 GiB；C: 最近 free 345,634,230,272 字节。部署前再测实时余量。

新增 npm 19 包，文件合计 84,878,030 字节。无权重下载/参考仓库 clone/全局安装/管理员安装。未在 PATH 找到 Python/FFmpeg，不断言机器全无。SAPI Huihui 中文可用；浏览器 Huihui/Kangkang/Yaoyao 均枚举为 localService=true。SAPI 音频已实测，非原声。

## 后继优先项

1. 采纳父任务专项研究，一次选一个成熟 TTS 做小规模本地部署。IndexTTS-2.5 先核对 custom 许可与资源，不自动接受新协议；后备 GPT-SoVITS v2ProPlus。不能擅自找参考录音或 checkpoint 当授权。
2. 合法测试录音 zero-shot baseline，验证身份/情绪、队列/取消/流式、首音与峰值资源，再决定训练。角色相似度未达成要明确说。
3. 无 key 的工作继续：本地 LLM、人设/语义记忆、动作导演、故障取消、资源与安全审查。不要缺 key 就停。
4. 密钥/真实 DeepSeek 测试最后等用户醒来本人输入；不索取聊天 secret、不读其密钥文件。授权总人民币 9 元、少量短测试、不充值。代码限 3 次、128 输出 token、16 KB 上下文+额外开销、10 倍峰价预留，失败不退预留，重启不重置。价格超 24 小时需先再核对。其他远程付费服务禁用。

## Git 与素材

origin `https://github.com/cloviszhu/Furina-1.git`，main，继承远程初始提交，禁止 force push。规划 `6cd019d` 已核对远程。实现提交由最终回报给出；后继先读 git status/log/远程再行动。

`.gitignore` 排除 assets/data/artifacts、原始模型/贴图/附件、音频/训练数据/权重/凭证。25 个用户资产在 `assets/characters/furina/source/mmd/`，整理哈希一致；仓库只含说明/结构记录/自写代码，不含原始素材。不得为云备份上传模型或截图。

用户澄清只研究参考项目思路，不复制/改编其代码、不做 GPL fork，不额外扩充署名文案；依赖必要许可照常。当前栈是用户授权自主选择的首阶段，不是永久锁定平台。

断线时父任务可在云端处理已推代码/规格的独立审查和无资产测试；本机模型与未推文件没有云备份。恢复后检查进程/工作树，防止冲突。不花其他钱、不泄露秘密、不用私人账户对外发邮件/消息、不改安全设置、不管理员安装。

## Verified Git checkpoint

Implementation commit: 68d012a21d9effb209930a92887c2ea8a2c5a04e. Push succeeded and origin refs/heads/main was verified at this hash. All stage-one tasks are complete; the OpenSpec change remains active, unarchived, for successor review. This final documentation checkpoint follows the implementation commit. No new feature work is included.
