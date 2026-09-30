
## 2026-09-30 persona continuity relay（已 app-only 部署，待用户验收）

最新阶段见 [人设与多轮验收接力](persona-quality-handoff.md)：六组三轮、角色语义 fixture、实际 prompt/history 安全报告、同时间线 style 连续与旧键非破坏兼容。74/74 隔离 Node tests、build、OpenSpec strict 与独立 Edge 浏览器检查通过；部署后十五项临时 DB/随机端口检查再次通过。真实角色表现及跨会话持久记忆仍未验收。父授权 app-only launcher 重启后，3000 为 PID80944/ready=true/mode=offline，测试 manifest 十八 steps；9880 PID67988 未重启且健康。历史累计七次/估算 ¥0.007372/reserve ¥0.46346 只读核对未改，社区 reference profile 可见未删改。用户页面/key 未读取或刷新，没有真实 API。用户自行安全刷新并本人显式启动收费测试。

代码 `0351cf8` 与交接 `e2215c3` 已推送；补充用户指定“咱们项目的仓库”的原话授权后，同一个 push 审批通过，GitHub `cloviszhu/Furina-1/main` 与本地 `e2215c3` 核对一致。此前 push 阻塞已解除，未换目的地、权限或通道。

## 2026-09-30 reliability relay（历史阶段，待父协调部署）

代码已提交但未在 3000 部署。本次没有重启 app84100/3000 或 TTS67988/9880，没有刷新用户页面、读取 key/.env、追加真实 API，也没有改正式聊天/记忆/预算。旧页面中的六项报告未迁移或伪造；旧服务不持有六条结果，不能在重启后补录。父已收集用户复制的真实 reply，请先保留旧页报告再协调 app-only 重启。

启动采用浏览器预生成 UUID → start → activate → 首个 step 握手。未产生模型调用的 starting 占位可由新显式 start 替换，断连/提前取消可释放；busy 即使取消或过期也拒新 start，直到真实在途请求 settle。并发/序号、9 元原子预算、取消预扣不退款、迟到结果隔离、固定六项串行、连续两失败停、无重试均保留。

之后明确启动的测试按 allowlist 留存 data/test-reports/<UUID>.json（已被 /data/ Git 忽略），不写正式历史/记忆。不保存 key、headers、config 或 provider 原始 error。100 个目录项上限、每报告 128 KiB；满或不可写时停止/拒新测试，不自动永久删除旧文件。GET /api/test-reports 只列概要，GET /api/test-reports/<UUID> 只读安全字段，沿用 Host/Origin/Sec-Fetch-Site 保护，拒绝路径穿越和目录 junction。页面“本地测试报告”可刷新列表、读取、全选复制或导出 JSON。当前无旧报告迁移；只读接口可供父在部署后直接读取新 run。

验证：独立临时 DB + loopback 随机端口 + fake provider。71/71 Node tests 通过（含目录 junction 边界）；针对性 Edge browser 测试通过，包括六项留存、读取、JSON 下载、取消/刷新隔离；build 通过（既有 bundle-size 提示）。HTTP start 响应 socket 强制中断后可重开且 0 模型调用/0 预算调用；真实在途取消后保持互斥，迟到成功不进报告。未执行会清空正式 history 的旧验收脚本。

父提供的真实统计（本接力未独立复验）：六项全请求成功，2208 输入 / 240 输出 tokens，估算 ￥0.006336；累计 7 calls、估算 ￥0.007372、reserve ￥0.46346。请求成功/JSON pass 不代表语义或角色验收。后继 persona 工作：fixture/测试元数据留在 UI、报告、manifest，不能进入角色文本；模拟已确认计划仍不能说已赴约；需要多轮真实性及角色表现评审。本次不改 persona。
# Project Exo — 最终独立验收交接

2026-09-30 最新：用户已撤销 14:30 UTC / 多伦多10:30 截止，并明确反馈声音不像芙宁娜、动作僵硬；体验目标尚未通过。当前按实际效果继续，不以测试数量代替主观验收。

本批一键测试与动作改进已完成代码及独立 fixture/PMX 验证，见 [本批验证](motion-budget-validation.md)。须父任务协调一次 app-only 重启才能加载后端新接口及此前 timeout 删除防护；本批没有刷新用户页面、重启 app/TTS 或触发真实 API。用户本人随后重新填写页面内存 key，再点一次收费自动测试按钮；代理不得代点或读取 key。测试固定六项、串行可取消，连续两次失败/预算不足/完成停止，专用虚构记录不进入正式聊天/记忆/声音。累计 9 元与旧预留账本保留，取消固定三次上限；普通聊天仍 demo。

动作修正为：不对每条回复招手，单次点头；双臂自然非对称休息、肩/胸/颈/眼错相小幅运动；抬臂屈肘轻挥手与 quintic 包络/Quaternion slerp 回位；重复点击不抢占；倾听定向及轻微前倾、说话一次小手势、情绪渐变和非等间隔眨眼。实际 PMX 对照截图/轨迹仅存本地 artifacts/motion-review，不上传 Git。无新动作资产/物理引擎，仍需用户观察自然度；声音问题由父任务另行处理，不代表本批通过。

13:18本人接入更新：13:17一次真实deepseek-flash短测试completed，输入354／输出41token，usage估计¥0.001036、保守预留¥0.06508、累计1/3次、剩余预留预算¥8.93492。这是只读status核验，验收者未读取key／代点／追加调用；普通聊天仍demo，听感和真实persona稳定性尚未通过。以下13:10零用量是此前快照。

最简入口：[START](../START.md)，当前直接打开 http://127.0.0.1:3000。若已停止，在本目录普通 PowerShell 运行 npm.cmd run local:start，再 local:status 等 app/TTS 均 ready=true；停止用 local:stop，先停止播放并等队列释放。无安装、下载、管理员权限或执行策略改动。

最终服务：app PID77724 / 3000，TTS 实际监听 PID67988 / 9880，13:10 UTC均ready，active=false/pending=0。13:06仅重启app载入删除入口，TTS未重启；13:10后本人接入，不再刷新其页面或重启服务。PID会变化，下一次必须重新status，不盲用旧PID。

独立结果与完整证据见 [最终验收](final-acceptance.md)。删除补齐后最新59 Node unit、15 Edge browser、6 Python boundary、build、四项OpenSpec strict通过，实际PMX/GPT-SoVITS/SAPI零skip。首次全套14/15，最后手机PMX截图45秒超时；独立11.8秒、保留失败trace的全套15/15复测通过，根因未证实，未提高门槛。真实六表达中文WAV、串行队列、实际后端断开及重启恢复通过；两PMX桌面/手机全身及表情近景已实际查看像素。

本轮修正：9880直接接口的登记路径/转写/请求及资源边界；JSON/fenced unicode key echo安全失败整轮无DB/history/speech；手机标题与桌面控件遮挡；PMX记忆测试改为临时库。十轮后早期来源direct eventId/context检查和故障保留草稿已加浏览器复核。

用户后续授权的删除缺口已补齐：参考录音管理区提供显式确认的自定义声线／非 neutral 表达删除与恢复，生成／排队中拒绝，内置 RAVDESS 与原始录音不变；可恢复副本继续保留本机。删除当前引用后本页及其它标签页取消旧播放，回退可用声线／neutral 并明确显示选择；不自动改用系统语音。用可丢弃 tone fixture 验证，未删除正式用户材料。

13:14追加超时隔离拒绝保护（计算状态不确定时409，59/59单元复测）：因本人正在接入key／短测试，明确禁止重启／刷新，其最后一行后端保护待测试结束后的下次app重启载入；删除主体已13:06部署。空输入短测试关设置并回主界面提示的UX已记录，用户要求此时不改UI。

未通过/未测必须保留：真实LLM、persona稳定性、角色相似度、人声身份识别与人工听感均未验收。自定义导入／删除UI用明确的合成tone fixture，不能当真人声音或真实角色参考验证。真人播放设备可听与质量需本人试听；自动浏览器静音只验证播放/口型管线。

用户最后两类动作：A 本人填写模型/API key，未来获准的DeepSeek短测试先复核官方模型价格，仍受人民币9元/3次/128输出token限制，本阶段零真实LLM/付费调用；B 提供有权使用的同说话人PCM16 WAV，确认转写/来源许可/完整试听，再人工验收音色、自然度、表达、响度。当前RAVDESS24是CC BY-NC-SA4.0非商业测试声，不是芙宁娜；没有已授权角色reference、没有训练或新大模型下载。

本机截图/真实WAV及机器证据在忽略目录 artifacts/final-acceptance/；参考入口旧截图在 artifacts/stage-four/。新管理区桌面／手机截图已看像素，无模型、凭证或消息；一张项目自有UI截图已私有交付Library，ID与本地元数据失败记录仅留忽略目录library-delivery.json（Windows无os.setxattr，不影响私有上传成功），未上传公网。模型readme未明确授权截图交付，模型像素只留本地。13:10显存4302MiB/8188MiB，TTS RSS2463MiB，RAM可用3750MiB；runtime逻辑大小约14.76GiB，非本轮下载量。13:10验收快照预算usedCalls=0/reservedCny=0；随后本人测试用量另核对。首次原版PMX测试的隔离问题与基线限制已在最终验收中准确记录。

无读取真实凭证/.env/桌面key，无私人消息、充值、提权安装或全局设置改动。PMX、音频、权重、参考素材、secret、runtime、截图不进入Git。只提交代码、测试和文字记录，main / cloviszhu/Furina-1，不force、不改可见性；最新提交用git log -1与远端main核对。

历史：[第四阶段验证](stage-four-validation.md)、[角色契约](character-contract.md)、[本地TTS](local-tts.md)。历史PID/计数不作为当前状态。
