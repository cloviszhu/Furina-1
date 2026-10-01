# 本机 ASR 草稿与剧情扩包发布记录

2026-10-01 UTC。用户已明确确认今后可将已检查 EXO 代码合并项目 main 并更新本机应用，保留数据、可回滚，不公开上线、不发收费请求。本次独立 ASR 与剧情 gate 双审通过 `98a8bbb422f25b27498de62fd31261e5a20c25b1`，未发现新增 P1/P2；在此范围内执行一次发布。

## Revision 与运行状态

已合并并推送 `cloviszhu/Furina-1/main`，运行代码 `5b882e395749b88517ee56e3696fd04541a1424c`（push 确认 `8402cde..5b882e3 main -> main`）。仅通过项目身份核验 launcher 停止旧 app PID63800、启动新 app PID71312，health ready=true。TTS PID67988、ready=true，全程未重启。未刷新或操作用户页面；已打开页面不会被强制加载新 bundle。

更新前再次检查预算无 reserved 记录、TTS active=false/pending=0、3000 无 ESTABLISHED 连接。旧生产尚无 ASR 录音入口；未打开麦克风、录音或转写任务。前端先在本机忽略目录构建通过，再在 app 停止后复制到 dist；保留旧资产供现有页面使用。

## 发布后只读核验

- `/api/asr/status`：available=true、offline=true、busy=false，backend=`whisper.cpp-base-cpu`，maxSeconds=30、maxBytes=8388608、timeoutMs=30000、threads=2。该查询仅检查运行资源存在，不加载模型、不执行识别。服务端固定项目 `.runtime/tools/ffmpeg/ffmpeg.exe`、`.runtime/asr/whisper-cpp/bin/whisper-cli.exe` 与 `.runtime/asr/whisper-cpp/ggml-base.bin`，不接收 HTTP 路径/URL配置；资源未加入 Git。
- 页面 HTTP200，线上与本机 dist/index.html SHA256相同：`1a5ff6e4a8f86b9a9d26e1ff5df92871ca2699b244eae5f46c7bc444fd23157a`。
- 线上与本机 `index--iF9klr-.js` SHA256相同：`54c5692d298fcb5d056b5413692fbb5141bbd576f8ad0dc67ef50d43e46a7164`。
- 剧情包 `server/data/furina-canon-4.2.v2.json` SHA256：`a2401390e618eeb8688e5f3774501a483443fda9208670e82b87c4c4a1d8406c`。
- 数据前后：events25、confirmed memories1、remote usage50、automatic episodes0、generation0；只查询计数，不读取真实事件/记忆正文，不向正式库注入测试内容。
- 预算前后：usedCalls50、reservedCny5.10934、reserved记录0。没有付费请求或新增消耗。
- `data/tts-config.json` SHA256前后一致：`f168a8f3e098cd8cba293270f78f46c9edeb83750a5e329b0ae4059278314c4c`。用户首选、凭据与运行模型未修改。

## 本机回滚与证据边界

忽略目录 `artifacts/local-rollbacks/asr-story-20261001T031500Z` 保存旧 dist、声线配置、旧 revision8402cde，以及 app 停止后的 SQLite 文件。备份仅在本机，未提交或外传。回滚时应先确认空闲、停止 app、恢复旧代码与 dist 后 app-only 启动；运行数据有新互动时保留当前库，不自动用备份覆盖。

工程证据：联合目标 Node61/61、OpenSpec strict17/17、独立双审、发布构建通过（既有 bundle-size警告）。真实 Edge MediaRecorder 合成流与实际 FFmpeg 探针在约30.003秒停止，解码30秒、UI草稿、临时目录0；它未调用麦克风或 Whisper，不能证明其他设备/codec/负载和真人识别质量。详见[联合审查交接](asr-story-release-handoff.md)。

剧情包54摘要、51enabled、3pending，仅覆盖五幕关键场景和个人任务相关节点；Act V审判仍是核心来源缺口，direct-game primary核实仍0，不称全文剧情完成。reported/亲历/解释资格、pending与author-only隔离、两条/1024字节独立canon预算保持。真人设备识别、真实模型知识边界、声线相似度与听感、动作自然度仍待后段集中验收。
