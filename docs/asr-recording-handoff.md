# 主动录音 → 本地转写草稿阶段交接

本分支 `feat/local-recording-draft` 从 main `3842fcfc` 隔离开发，已快进同步最新 main `8402cde1d3db7d6031abdb2c403453adcc9ce79b`。集成 owner 负责 server/index.js 的路由注册；本分支不修改该文件/providers，不推 main、不部署、不操作正式页面。

## 集成合同

```js
import { createAsrHandler } from './asr.js';
const asr = createAsrHandler({ runtimeRoot: join(projectRoot, '.runtime') });
// 在既有 Host/Origin/Fetch Metadata 校验之后，其他 /api 路由之前：
if (await asr(req, res)) return;
// createApp.close() 内，等待取消进程与目录清理：
await asr.dispose();
```

handler 也独立核验 loopback Host 与实际 socket port、Origin、Sec-Fetch-Site，确保专属隔离 HTTP 测试不依赖外层保护。`GET /api/asr/status` 返回 `{available,backend,offline,busy,limits,code?}`，不加载模型、不执行 GPU 探测、不下载。固定 backend 为 `whisper.cpp-base-cpu`。

`POST /api/asr/transcriptions/:captureId` 接收 UUID 路由和原始音频，不接受 JSON、文件路径、URL、query 参数。MIME 支持 audio/wav、audio/x-wav、audio/webm、audio/ogg、audio/mp4（含 codecs）；对应 RIFF/WAVE、EBML、OggS、ftyp magic。返回 `{captureId,text,backend,seconds}`。错误只返回 `{code}`，不泄露原始引擎 stderr、路径或转写。状态码为 400 参数、403 来源、405 方法、413 大小/时长、415 格式、409 busy/预取消、499 运行取消、422 解码/结果失败、503 runtime 缺失、504 超时。

`POST /api/asr/transcriptions/:captureId/cancel` 必须空体，返回 `{captureId,cancelled:true}`；当前任务 abort 后等待子进程 close 才释放互斥。预取消 tombstone 60秒 TTL，最多128条。`dispose()` 同样等待当前资源释放。

默认资源路径相对于模块项目 `.runtime`：`tools/ffmpeg/ffmpeg.exe`、`asr/whisper-cpp/bin/whisper-cli.exe`（及四个 CPU DLL）、`asr/whisper-cpp/ggml-base.bin`。隔离 worktree 测试传入现有主仓 `.runtime`，不复制/下载模型。可信应用配置可注入路径；HTTP 不能改路径。

8MiB 上传、30秒音频、30秒全程墙钟（含上传）、单任务，无队列。FFmpeg 固定 demuxer 由 magic 决定，protocol whitelist file/pipe，不启用网络；解码最长31秒用于识别并拒绝超过30秒的录音，PCM16 mono16k。Whisper 固定 no-gpu、threads2、zh，无 prompt/translate/VAD/mic。自有短随机目录，退出/失败/取消后清理；音频和转写不进日志、history、memory 或持久化存储。草稿仅用户显式发送才进入既有聊天路径。

## 前端与兼容

`src/recording.js` 提供 RecordingController 与 mountRecording，状态 idle/requesting/recording/transcribing/draft/error。点击录音才检查状态并请求麦克风，开始前停止现有角色播放/参考预览。最长30秒自动停止；停止立即关闭 tracks 再封装/转写。取消、模式/角色上下文修改、pagehide、beforeunload、dispose 都停止 tracks 与请求；迟到授权关闭返回 tracks；迟到转写按 capture generation 与草稿 revision/value guard 废弃。用户即使编辑后恢复原文也不会被覆盖。

请求权限/录音/转写期间，Enter 和发送明确提示停止/取消，不能发模型请求。显式语音测试、批次启动和预览先取消录音。既有 turn/segment 与自动记忆代码保持原合同；只增加最小 composer 接线。用户收到的草稿不自动保存/发送，也不自动调用模型。

## 验证证据

- 专属 Node：17/17，包括有界音频、origin/method/magic、missing runtime、busy、TTL容量、超时/断连/清理、授权迟到、草稿编辑、设备/拒绝及超限；在 HTTP decoder/recognizer 两阶段分别取消真实隔离 Node 子进程，确认 close 后目录为空。
- 同步 canon adapter 后，全量 Node 216/216，通过，无 skip。
- 隔离 Edge browser：8/8（录音3、coherent speech/turn2、natural memory2、显式聊天1）。fake getUserMedia/MediaRecorder；临时 DB、随机 loopback 端口，凭据与 provider 均替身，不读取真实 key。未运行依赖生产3000/TTS9880的其他浏览器场景。
- 原 memory UI VM 夹具新增挂载替身和 document listener；原显式聊天浏览器断言限定 `#memory-list`，避免已存在的自动卡片误充手动保存完成。
- build 与 OpenSpec strict 通过，保留现有 bundle >500kB 提示。
- 一次真实现有 WAV HTTP smoke：2026-10-01T01:24:30.308Z，状态200，backend whisper.cpp-base-cpu，输入3.64秒，草稿16字，墙钟2713ms，captureId匹配，临时文件0，offline=true。输入为已批准 greeting-16k.wav；未合成新音频。随后增加强制 demuxer 与响应前清理，通过隔离单元核验，没有追加 Whisper 推理。

可复用命令：`node tests/asr-local-smoke.mjs <已有runtime目录> <已授权WAV>`。只有显式执行才加载模型；该脚本不下载、不触碰正式服务，不打印转写正文，仅打印安全运行指标。

## Readiness 与集中验收

本分支模块/前端可集成，正式服务尚无 ASR 路由注册；owner 注册后须用统一验证集检查完整应用。本阶段没有重新启动 app/TTS，也没有真正开启用户麦克风、付费调用、Windows 权限修改或 System.Speech 绕过。

假媒体测试不证明真实设备、角色相似度、真人识别质量或持续互动体验。已有文件 base 样本 CER14.13%、个别35.71%只是小批准语料结果。真人准确率、噪声、设备与自然度仍待一次集中人工验收；不报告体验百分比。

集中验收留到 owner 完整集成验证之后：在隔离/获授权应用页面点击录音，短句停止、校对草稿，编辑后显式发送；再核验取消、模式切换、刷新和拒绝权限恢复。此处不要求用户立即开麦；部署/正式页操作仍由 owner 按当前授权办理。
