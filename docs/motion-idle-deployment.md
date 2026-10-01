# 已审 idle 适配本机发布

2026-10-01 UTC。用户此次明确原文：“允许将这次待机动作改进合并到 Furina-1 的 main，并更新我本机的 EXO，保留数据和回滚版本。”在该范围内发布已审 `33b77aed10e23ab741bfaf45a6465da2c6dd0feb`，不涉及small下载、公开上线、收费调用或密钥读取。

## Revision 与生命周期

运行代码 `90b375535a923210754db1c7131bbd0c8cbc3af3`，合并push确认 `2297fa0..90b3755 main -> main`。先在忽略目录构建，通过后再次确认预算reserved记录0、TTS active=false/pending=0、ASR busy=false、3000无ESTABLISHED连接。只读launcher核实本项目进程身份后，仅app-only停止PID100408、启动PID101180，health ready=true；TTS PID67988、ready=true，未重启。

无麦克风、浏览器或用户页面操作。服务端检查证明没有已上传ASR任务或在途HTTP，不声称能观察浏览器尚未上传的本地录音。已有页面没有被强制刷新；旧bundle资产保留，新动作代码在页面自然加载新bundle后生效。仅分发CC0小派生数据，不提交用户PMX、纹理或渲染证据。

## 发布后只读核验

- ASR保持available=true、offline=true、busy=false，`whisper.cpp-base-cpu`；30秒/8MiB/30秒超时/CPU2线程配置不变。未执行识别、下载或切换模型。
- SQLite前后events25、confirmed memories1、remote usage50、automatic episodes0、generation0；只查询计数，无真实正文读取或测试记忆注入。
- 预算前后usedCalls50、reservedCny5.10934、reserved记录0；无新增收费调用。
- 声线配置SHA256前后一致：`f168a8f3e098cd8cba293270f78f46c9edeb83750a5e329b0ae4059278314c4c`。双PMX文件前后SHA256一致，用户首选/凭据未修改。
- 页面HTTP200，线上与本机dist/index.html SHA256一致：`2e36f859c4b7cfc7bf54e5f56939325cce69fb7407ec2df1235ca92d6eb896fe`。
- 线上与本机新bundle `index-D9XjtFXL.js` SHA256一致：`47f8bb7308e5ee77323223b4fbce214522691a16cda80e62d3a2dd9df48ba2f2`。

## 回滚与证据边界

本机忽略目录 `artifacts/local-rollbacks/idle-adapter-20261001`保存旧revision2297fa0、旧dist、声线配置、更新前hash，以及app停止后的SQLite文件。备份quick_check=ok、events25；只在本机，未提交或外传。回滚应先核实空闲、app-only停止，恢复旧代码与dist后启动；有后续互动时保留当前库，不自动覆盖为旧备份。

已审工程证据：当前main联合Node42/42、浏览器8项覆盖、双PMX前后180秒idle及取消/模型切换回归、build、OpenSpec strict17/17。发布构建874.35KB JS/257.82KB gzip，仍有既有大chunk警告；发布后只做只读状态/hash核验，没有再跑真实模型或打开生产页面。来源与重建、初次fixture失败及测试基准修正详见[集成交接](motion-idle-integration-handoff.md)。

自动idle新增来源化髋胸肩小动作和脚固定；greet/nod仍原程序实现。单clip循环、衣物/手指动态、连续播放节奏、角色相似度、声线听感和完整活人感未验收，OpenSpec体验任务2.3/2.4仍未勾选。部署成功不等于这些体验已完成。
