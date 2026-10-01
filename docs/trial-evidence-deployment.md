# 审判窄增量本机发布记录

2026-10-01 UTC。`f1074bf70f82c247323eee5f7ea8ec3628d8d6b0`独立静态复审无P1/P2；沿用户已明确确认的持续checked main/本机更新授权，合并为运行代码 `1fff412d5bf213dd46abeca6d51006a988d5eaec`，push确认 `7e6b9bd..1fff412 main -> main`。只新增数据、测试与文档，不改ASR/provider/前端/launcher实现。

## 本机更新与守恒

更新前核对预算reserved记录0、TTS active=false/pending=0、ASR busy=false、3000无ESTABLISHED连接；只读launcher验证项目进程身份。没有访问用户浏览器或麦克风状态，不声称服务端检查能观察尚未上传的浏览器本地录音。仅停止旧app PID71312并启动新app PID100408，health ready=true；TTS PID67988、ready=true，全程未重启。未刷新或操作用户页面，未开启麦克风/识别/付费请求。

- ASR status前后available=true、offline=true、busy=false，backend=`whisper.cpp-base-cpu`；限制30秒/8MiB/30秒全程超时/CPU2线程保持。运行模型与配置未更改，没有进行base/small切换。
- SQLite计数前后一致：events25、confirmed memories1、remote usage50、automatic episodes0、generation0；只查询计数，没有读取真实正文或向正式库注入测试。
- 预算前后usedCalls50、reservedCny5.10934、reserved记录0。
- 页面HTTP200；dist/index.html与线上SHA256保持 `1a5ff6e4a8f86b9a9d26e1ff5df92871ca2699b244eae5f46c7bc444fd23157a`，本次不build或修改dist。
- 声线配置SHA256保持 `f168a8f3e098cd8cba293270f78f46c9edeb83750a5e329b0ae4059278314c4c`；TTS、用户首选、凭据保留。
- 新canon包SHA256 `481b743a46c2fed913e52fca43298a87d7795b8273f839c5c6b26484fa014b53`，60条/56enabled/4pending。

## 回滚与未完成项

本机忽略目录 `artifacts/local-rollbacks/trial-increment-20261001`保存旧revision7e6b9bd、旧canon/coverage与声线配置，以及app停止后的SQLite备份。备份未提交或外传；需回滚时先核对空闲、app-only停止并恢复旧代码/包后启动，不自动用旧库覆盖后续用户互动。

此次补入5条有来源审判记录，qualification仍为二级转写/search_index_inspected，直接页面和音频未核实，direct-game primary0；旧错误HoYoDex路由继续禁用。新增水测试当庭声称不变神性事实，浓度安排是当庭reported获知，双重判决不授予私密机制知识。其余控诉/否认、陷阱搭建、白淞道歉缺证内容保持禁用/缺口，不称审判或五幕全部完整。

工程证据为相关Node40/40、OpenSpec17/17与独立复审，实际投影481–602bytes在1024上限内；真实模型知识边界、设备识别和听感未验收。见[集成交接](trial-evidence-integration-handoff.md)。后续等待ASR small对比结果再决定是否改动，当前保留base生产路线。
