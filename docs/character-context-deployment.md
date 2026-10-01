# 有来源角色知识：本机发布核验

2026-10-01 UTC。父线程提供了具体发布范围的提问及用户原答“确认”：允许今后将EXO已通过检查的代码合并项目仓库主分支，并更新用户电脑上的本地应用，保留数据、可回滚、不公开上线、不发付费请求。本次补充证据后，同一发布动作的自动审批认可，才执行main合并/push及app-only更新；没有绕过此前授权不够明确的拒绝。

## Revision与服务

已审查开发代码 `0823f03f92f0d76a7a7a885d0b6df66ffadfad52`，依赖独立来源模块1afc9a34/0535c30。main合并代码 `fb74ffa7d65fccb02d7261bb0c3426a321fe0d53`；push明确确认 `3842fcf..fb74ffa main -> main`。当前app PID63800、ready=true；TTS PID67988、ready=true，未重启。此次仅更新后端，未build或替换dist、未操作用户页面。

更新前检查app旧PID101352、项目health身份、TTS空闲active=false/pending=0、预算无reserved未结算记录、3000无已建立请求连接；使用项目既有launcher stop/start --app-only，并在停止前再次核对空闲。

## 保存与只读核对

- dist/index.html部署前后SHA256一致：`599965F1B89F19C602ABDC42A80479731FD76BD11B57A8019D32DFEC4E8FA1EF`；data/tts-config.json hash一致，声线登记不变。
- 更新前后SQLite行数与generation一致：events25、confirmed memories1、remote usage50、automatic episodes0、generation0。仅查询行数，未读取或输出用户事件/记忆正文。
- budget usedCalls50、reservedCny5.10934前后一致，没有新增模型调用或费用。
- 首页HTTP200且原自然记忆容器存在；未刷新用户浏览器、未代点任何聊天/录音/音频功能。
- 旧dist、停止后的SQLite和声线配置副本仅留本机忽略目录 `artifacts/local-rollbacks/canon-20261001T011942Z`。不提交、不外传；旧代码3842fcf可恢复。回滚需先确认当前空闲并保留新互动，不自动覆盖数据库。
- 首次只读计数命令因PowerShell/Node引号解析报语法错，未执行SQLite代码；改用stdin脚本后完成上述核对。没有因此重启服务或重复发布。

## 已部署范围与未完成项

最小provider adapter固定furina/4.2/当前query，独立最多2条/1024 UTF-8 bytes canon，在完整保留原互动数据后利用既有总输入余量；原收费预留计算完整最终messages。来源资格、reported非亲眼、理解非事实和HEADER核实等级措辞已接线。独立目标检查50/50、HEADER相关30/30、OpenSpec strict与语法/diff检查为发布前工程证据，详见 [接线交接](character-context-integration-handoff.md)。本次不重复相同全量或重负载测试，也不运行真实模型。

角色包12条/11enabled/1pending，direct-game primary核实仍0。现有官方托管参考/二手对话转写不是原始游戏核验，不宣称剧情覆盖完善或模型实际自然运用已验收。ASR的独立模块、前端与route注册仍在并行开发，本次未汇合或发布；未改其owned文件。真实角色表现、声线相似度、长期动作自然度与主观体验仍待集中验收。
