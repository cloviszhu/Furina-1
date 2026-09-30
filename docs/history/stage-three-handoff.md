# Project Exo · 第三阶段交接（最新）

2026-09-30 第三阶段已稳定收口，停止继续加功能，供新会话接续。用户总授权截止 14:30 UTC / 多伦多 10:30；此交接不自动延长时限。前两阶段均已停止。远程 `https://github.com/cloviszhu/Furina-1.git`，main；不强推。

Git verified checkpoint：实现提交 **`d050f046f4b70907cfe75db4feb55d805ea94169`** 已推送，2026-09-30 10:46 UTC `git ls-remote origin refs/heads/main` 与 HEAD 一致。此后只提交交接检查点和任务完成记录，没有新实现；最终文档 HEAD 以 `git log -1` 为准。

## 本阶段结果

- 独立 QA `1d757191ebfad1a77cd9faabcad38ea538c9299c` 已 cherry-pick 为 `fad06848e9664153bb88bbeefa22b7a994975420` 并 push/ls-remote 核对，保留 TTS。修复记忆改删期间旧回复回流、demo 冲突前提误肯定与 stale sourceId。
- 第三阶段增加同源多标签页改删通知、有限角色时点/风格与历史隔离、结构化正文/表达契约、手动/随回复表达、PMX 基础表情、语音设置切换取消与明确备用/恢复提示。非角色素材和规则演示始终明示。
- 最终 **41/41 unit、10/10 Edge browser、build、三个 OpenSpec strict** 通过，0 fail/skip。真实 PMX、GPT-SoVITS 与 Windows SAPI 已验证；真实 LLM 仍为 0 调用。
- 详情 [第三阶段验证](../stage-three-validation.md)、[角色契约与资料边界](../character-contract.md)、[已修 review](../stage-one-review-pending.md)。阶段三 OpenSpec `stage-three-journey-quality`；前两阶段未归档，不将格式校验当产品验收。

## 服务与启动

应用 http://127.0.0.1:3000，当前本轮工具 session **8894** / Node PID **79524**。TTS http://127.0.0.1:9880，实际重启后 session **44493** / Python PID **64468**，CUDA FP16 v2ProPlus。最后检查 ready=true、active=false、pending=0，两模型 available=true，budget usedCalls=0/reservedCny=0。

新会话的工具 session 可能不可访问，先实际检查 status 与 `netstat -ano`，再检查 PID/路径；不要凭旧数字重复启动或泛杀。若停止，先核实项目自有进程。沙箱 COM/进程操作被限制时所用工具执行范围放开不是 Windows 管理员提权，没有改安全设置。

```powershell
npm.cmd run build
npm.cmd start
# 仅当 9880 未有本项目服务时：
.runtime/tts-venv/Scripts/python.exe scripts/run-local-tts.py
```

已有隔离环境和官方权重，不需 npm 重装/再次下载大模型。现有 RTX4060 Laptop 8188MiB VRAM、16GB RAM；不追加大权重。setup verify 为只读验证，不重复部署。

## 本地证据

`artifacts/stage-three/`：两形态 idle/greet、五种 expression、happy/sad/angry portrait、settings/mobile、visual-evidence.json、真实停机 tts-unavailable.png/json、service-recovery.json 与两条 restart WAV。代表截图：`ousia-greet.png`、`portrait-sad.png`、`settings.png`。全为本地忽略文件，不上传用户角色图像或音频。

实际 TTS 停机后 502/启动命令明确；恢复后两个同时请求观察单 active/一等待，neutral 8.30s、happy 排队总完成9.55s（增量1.25s），完整 PCM16。前阶段六情绪/资源基线仍见 `artifacts/tts/`；没有重做训练或人工质量验收。

## 下一会话重点与限制

1. **保持能力边界**：当前规则演示不是真实推理；JSON/provider 测试只证明协议。两个固定剧情时点、三风格已经可选，角色摘要是项目解释，官方视频/动态页未完整提取。真实模型的角色一致性、自然中文、情绪选择与持续成长仍需评估，不要称 mock 已完成人格。
2. **声音**：RAVDESS Actor24 CC BY-NC-SA4.0 非商业参考，不是芙宁娜声线。人工听感/自然度/相似度/身份稳定性未验证。先由用户试听基线并提供或确认合法角色参考，再讨论训练；不下载来源不明音频/权重，不再装大权重。非流式、无 GPU 硬取消，无物理/精确音素口型。
3. **费用**：用户本人最后输入 key 前不读 secret/`.env`、不调用真实收费模型。仅未来 DeepSeek RMB9，最多3次/128输出token/次，输入16KB、10倍预留、无重试、失败和重启不释放预留。官方价格10:15UTC核对 Flash2/8、Pro9/27 元每百万token；24小时后 fail closed，实际测试前复核。其他远程服务仍禁用。
4. **数据库**：新增 events.context_key，旧数据默认 aftermath:natural；配置刷新恢复默认，按配置显示历史。纠改/删除清空全部短期会话并保护其他确认记忆。同源 BroadcastChannel 不覆盖其他浏览器/外部脚本直接改 DB。不要手动重置 data/exo.sqlite 或预算。
5. **测试**：`npm.cmd test`、`npm.cmd run test:browser` 需要既有 app/TTS/资产；缺语音时相关测试会 skip，不算通过。新增 journey 使用临时 SQLite，原生产 stage 测试创建/删除验收条目会按产品语义清空短期聊天。截图 `node scripts/capture-stage-three.mjs`，真实队列 `node scripts/check-real-tts-queue.mjs`。

所有模型/贴图/参考/生成音频/权重/运行数据/密钥留本地不 Git。未访问桌面秘密、未训练、未充值、未复制 D_sakiko、未新接受协议、未发信或改仓库可见性。下一步应开新会话，不继续无限长上下文。

## 附：第二阶段原交接记录

# Project Exo · 第二阶段交接

2026-09-30 09:45 UTC 附近安全交接点；父任务要求结束当前执行轮次并接力，用户项目总授权窗口仍到 14:30 UTC。

实现提交 12dc2ec5033193185de0649a0c5bc3a60f7bd4ac 已推送 origin/main 并逐字核对远程；运行时、权重、参考音频、生成音频及密钥均未提交。最终交接提交以 git log -1 为准。

## 第二阶段实际成果

已完成单方案 **GPT-SoVITS v2ProPlus** GPU 部署、自写 Node 适配器、六种表达 reference、设置界面/真实 PCM16 播放/振幅口型/有界队列与取消。官方源码 `48b1a0169a28582a8984402f82cf438d3bfa6aca`，未改源码、未复制参考角色项目。Index 自定义协议未接受，未下载 Index。

项目 http://127.0.0.1:3000，最终重启运行会话 **9820**（替代21036，加载最后的busy/WAV防护）；TTS http://127.0.0.1:9880，会话 **56407**，已确认 TTS PID **75548**（接续时再核对，不能假设不变）。原阶段会话/PID 后来已退出，确认端口空闲后启动了当前服务。未泛杀 Node/Python 或关闭用户无关程序。

安装器 `node scripts/setup-local-tts.mjs --verify` 已验证源码与118包依赖兼容、CUDA正常；`--skip-models` 幂等安装检查会话 **72426** 已成功结束，无需重复。环境主体在忽略目录 `.runtime/`：portable Python3.11.16、torch/torchaudio2.7.1+cu126、ORT1.22.0、推理依赖。uv zip约18MB、Python约24MiB、torch wheel约2.5GiB、官方权重子集1,892,104,076字节；RAVDESS官方zip208.5MB。逻辑文件合计15.77GB（含缓存/链接重复统计），观察C:减少约9.81GB。下载均已完成；没有正在下载的权重。

真实同句六表达（neutral/calm/happy/sad/angry/surprised）全部成功：32kHz、4.64–6.04秒、削波0；冷进程9.272秒，热1.109–1.354秒。采样进程RAM峰值4811.7MiB、整机GPU峰值4849MiB、最低空余RAM1498.2MiB。仅短句实证，未证明训练或长文本资源。

18/18 Node、3/3真实Edge浏览器（无跳过）、build、OpenSpec严格校验通过；最后的busy健康状态和WAV重复块防护由Node回归与现有真实样本再核验。浏览器静音不等于人工音质验收。完整证据见 [第二阶段实测](../stage-two-validation.md)、[运行指南](../local-tts.md)。本机 `artifacts/tts/` 保存六段WAV、baseline-6.json、acoustic-diagnostics.json，不能公开上传。

## 第二阶段限制与下一步

- 获许可reference是RAVDESS Actor24女声，CC BY-NC-SA4.0，仅非商业本机测试；没有芙宁娜许可录音，不能证明角色相似度。LibriSpeech测试样本另已下载，未参与最终六表达基线。
- 情绪通过同一人的不同表演reference控制，不是独立emotion vector；声线cosine相对生成neutral约0.857–0.958，angry/surprised漂移较大。指标未校准，不是准确率或身份保证。人工音质/情绪自然度/身份试听均尚未完成。
- 不训练：先让用户试听并确认/提供允许的角色reference，再决定零样本或少量微调。不等API key才能继续独立工作。
- 完整WAV返回，stream=false；取消立即停止播放/投递并丢弃迟到音频，hardCancel=false，必须等上游计算释放再跑下一句。120秒超时隔离需要重启两个项目服务。
- 三个记忆review问题仍未修：[待修记录](../stage-one-review-pending.md)。父任务另有隔离git worktree QA，负责revision竞态、冲突前提误肯定、pending来源；本工作树未重复修复，不要声称已解决。
- 真实远程模型调用0、预算使用0；未读任何密钥文件。DeepSeek价格最后实际测试前重核、key仍需用户本人最后输入，不调用其他收费服务。
- 初次上游NLTK下载曾落在AppData；后续数据明确准备在.runtime/nltk-data。不清理可能共享的数据，不改安全/执行策略，不安装管理员组件。

## 第一阶段历史交接

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
