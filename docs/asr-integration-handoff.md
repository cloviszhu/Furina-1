# 本地ASR草稿：完整应用接线与复审交接

独立分支 milestone/asr-draft，worktree `C:/Users/zhu06/Documents/ChatGPT/Project Exo/artifacts/worktrees/asr-draft-integration`，基于已发布 main8402cde，已汇合2954c092为600c41f。仅本分支开发，main和app63800/TTS67988未操作；未读取密钥、开启真实麦克风、追加付费请求或运行Whisper推理。

## 最小接线

server/index.js在原有Host/Origin/Fetch Metadata校验之后、其余API之前注册createAsrHandler。默认runtimeRoot仍为项目`.runtime`。可信createApp测试配置可通过asrOptions注入临时runtime/tempRoot/process替身；HTTP不接收路径、URL或引擎配置。其他API仍走原有处理，原DeepSeek显式收费、预算、turn/segment、canon与来源化记忆合同保持。

close先停止接收连接，再await asr.dispose等待活跃子进程退出与临时目录清理，最后等待HTTP关闭并关数据库；避免先等待活跃HTTP结束而无法取消ASR的关闭死等。

审查修复：原取消tombstone满128时挤掉最早记录，可能让TTL内的迟到上传重新开始。改为新未知取消在容量满时明确429 cancel_capacity，已登记ID可更新、旧取消不丢；60秒TTL正常过期再释放容量。通过注入测试时钟在59999ms/60000ms边界验证，无等待60秒。文档中的单任务、30秒、8MiB、CPU2threads和本机文件清理限制不变。

独立复审P2进一步修复：未知预取消容量不能阻止唯一active任务取消。保留128未知预取消加1个active取消的有界例外，总保留最多129；例外占用时拒绝新的上传/未知取消，待TTL释放后恢复，不驱逐旧ID。新增实际自有Node子进程fixture在满128时取消active→499/child close/目录空，旧ID及active迟到重传409，TTL后可恢复。相关ASR17/17通过，已提交复审delta。

## 联合验证

最新目标Node40/40通过（3.47秒）：ASR模块、实际app路由、录音控制器、说话队列、turn与canon接线。四项新增集成fixtures覆盖：

- 原始HTTP伪造Host、跨Origin、cross-site/same-site GET/POST均拒绝；危险参数/MIME被拒绝且0 worker启动。
- RecordingController→真实随机端口app→实际ASR handler（decoder/recognizer替身）→可编辑草稿。开始前0麦克风请求；停止关闭tracks；响应前目录清空；没有/api/chat调用。旧确认记忆、events、automatic episodes、预算、模型调用计数与识别前一致。
- 预取消阻止处理，活跃取消等待worker结束前仍busy，结束后清理、无历史/记忆/费用写入。
- app.close取消真实独占Node子进程并等待close及目录清理，再结束HTTP；不调用Whisper或真实媒体设备。

首次联合运行两处夹具失败：fetch规范化伪造Host、测试重复close同一SQLite。改用原始http.request并防止夹具重复关闭后40/40通过；没有把首跑描述为通过。

review build通过（789.23kB，仍有既有大包警告），只输出本worktree `artifacts/asr-integration/build`，未碰生产dist。OpenSpec全部16项strict、语法、diff检查通过。日志在该忽略目录node-final.log/build.log/openspec.log。

源分支已报告216/216全量Node、8/8隔离浏览器及一次真实既有WAV smoke；这些是原作者阶段证据，本次没有重跑相同全量/浏览器或重负载推理。UI与浏览器夹具相对2954c092保持不变；新增真实app HTTP+控制器fixture负责联合路由边界。不得把文件识别、fake媒体或工程通过当真人设备/识别质量证据。

## 复审与未完成项

当前正式服务还没有ASR入口，这一批只推开发分支供独立review，不部署或推main。后续批准汇合后需随新frontend build一次更新。真人麦克风授权/设备/噪声、识别准确率、体验自然度尚未验收；已报告5样本CER14.13%并非真人质量或产品完成度。角色知识详细扩包由独立owner继续data/tests，当前不自行改其文件。

## 实际MediaRecorder边界探针

按复审要求用独立随机端口页面、真实Edge MediaRecorder、AudioContext振荡器流和实际FFmpeg检查30秒自动stop；没有调用getUserMedia麦克风，识别阶段用替身，不调用Whisper。第一次探针因等待参数位置错误在30秒超时，没有取得产品结果；修正等待设置后得到stopMs30003.3、decodedSeconds30、UI draft、micCalls0、chatCalls0、临时目录0。本样本没有复现decoded>30拒绝，故保留30000ms前端与30秒后端严格边界。其他设备、codec和高负载计时仍未验证，不能将单次通过扩大为通用保证。

显式复现：`node tests/asr-recording-boundary.mjs <已授权runtime目录> 30000`。只在显式执行时启动合成流/FFmpeg，清理全部自有临时文件；不运行Whisper或触碰生产页面。最新剧情扩包与ASR联合证据见 [联合交接](asr-story-release-handoff.md)。
