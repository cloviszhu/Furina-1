# 持久记忆保存修复 app-only 部署

2026-09-30。父任务独立复审 `23bbeb90ff004980da38eec749eff2f90e75a1c9` 无部署阻断，明确授权app-only。实现提交为 `72cfe906fee345f9c10bc08c3c270c477865085a`。

部署前两次只读核对：旧app PID78928/3000 ready=true，43条预算全部completed，无reserved在途项；报告无starting/running测试；app TCP仅listener，无外部模型连接。TTS67988/9880 ready=true、active=false/pending=0。

项目launcher核对绝对入口、进程创建时间、执行文件及health rootId后，仅停止app；build更新dist，然后仅启动app。新app **PID69452 / 3000 / ready=true**，已复审版本 `23bbeb9`。TTS **PID67988 / 9880 / ready=true** 未停止或重启。未刷新用户页或执行真实凭据/模型调用。

## 保留证据

- 完整budget对象逐字段相等：43 completed、预留¥4.16506（原浮点4.1650599999999995）、剩余¥4.83494。没有用户新增调用或部署附加调用；历史估算¥0.073186保留。
- events完整原行（含emotion）、memories、remote_usage的数量与摘要哈希前后一致。schema逐字段相等，无迁移、回填或重复数据清理。当前4条原history、0条确认记忆只是保留状态，不是本轮清除结果。
- 全部安全报告文件SHA256与列表一致，原两个18步报告未改，末题persistence:not-tested不改成通过。
- served HTML SHA256 `f8cd9f973b393b84e80f478f6a542a6db8abb16cade1f5136908af156758e607`；JS `index-B473DBRa.js` SHA256 `9c21c20e6d91931f2ee82fcb61463f086b1a70d8db0e3d31c702b01eacad99b9`；CSS `index-C8Uueq6V.css` SHA256 `06b3ef903857f7d41aea4ca4acb991e2cd0c83bd3ae0e2dac5b095734c7d0b09`。三者与dist相等，新memory-save控件已服务。
- build通过，仅既有bundle>500kB提示。父任务已经独立复审；本阶段没有重复执行或伪造真人模型测试。
- 本地忽略证据：`artifacts/persistent-memory/deploy-{before,after}.json`、`deploy-verify.mjs`，只有健康、数字预算、schema、计数和摘要。私有文字仅在本地内存计算摘要，不保存原文。不调用credential API、不读取CredMan/key/密码框/环境秘密；已存凭据未触碰。
- 首次核对脚本将SQLite的null-prototype schema对象与JSON普通对象做deepStrictEqual而误报；改为只规范化对象prototype后复核全部schema字段相等。这是核对工具表示差异，未改数据库或服务。

## 最短真人真实模型验收（本人操作，本阶段未执行）

不需要再跑18项。两次明确单次DeepSeek调用即可做一次排除历史的记忆使用检查：

1. 本人需要加载本次UI时可自行刷新一次；选择同一剧情时点（如主线落幕后）、DeepSeek、已确认模型和已保存凭据来源。聊天框输入合成资料“我第一次舞台演出扮演邮差，散场时朋友送我一束向日葵。”在设置点 **“用当前输入执行一次 DeepSeek 测试”**。普通“发送”仍为演示，不会花远程额度；单次成功会生成正常user source。不要点18项批次。
2. 在刚生成的 **用户消息** 点“保存为共同经历”，核对原文与“来源：这条用户消息”，再点 **“记住这一刻”**。仅选择来源不是保存。记忆卡查看来源可确认是用户原话，而非模型自述。
3. 为排除history，切换到**没有相关历史的另一剧情时点**。部署时“重返舞台”没有history（原4条在aftermath:natural），先确认聊天为空；不要只切语言风格。已确认记忆现为全局共享，所以另一时点仍能从SQLite检索。这是“历史排除后的记忆使用验证”，不是同时间线独立session机制。
4. 问“还记得我第一次舞台演出扮演谁、收到什么花吗？”再次明确点击 **单次DeepSeek测试**。问题不提供邮差/向日葵答案；核对UI引用记忆和真实回复。失败不自动重试，不把demo结果当真人模型通过。本阶段没有代执行这两次调用。

若另一时点已有相关历史，不能称其为空会话。可在原时点用**普通发送（演示，无收费）**依次发“占位消息甲”“占位消息乙”“占位消息丙”“占位消息丁”，确认得到4组user/assistant且未重述邮差/向日葵，再执行步骤4：provider只组装最近8条事件，4组将原资料与首次回复移出请求history。历史记录仍留在SQLite和可能的UI列表里，这只是请求history窗口排除，不能声称历史已删除。

## 刷新与验收边界

浏览器刷新、关页再开、app重启都会从SQLite恢复同timeline的history；普通配置刷新恢复，密钥来源默认回本次输入，需本人重新选择已存来源。语言风格切换沿用同timeline历史。以上动作均不能单独证明跨会话检索。

当前没有独立“新会话/清空当前对话但保留记忆”按钮。本地回归已验证真实SQLite/server重开后实际检索进入mock请求，且原资料排除history。真人真实模型长期记忆质量仍未测试；上面最短链只验证一次本人确认记忆的真实模型使用。若要验收同timeline重启后的长期记忆，应由父任务协调app重开并仍排除history，不能把重启后恢复的旧对话当记忆证据。structured仍指规范化后有效契约，不保证原始输出必然纯JSON。
