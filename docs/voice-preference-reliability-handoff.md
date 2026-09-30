# 声线首选可靠性修复交接

**最新状态：独立复审通过后已部署 `1e66a88a6286b92caed31f6e41fa3ce96148dd5e`，app PID77220，TTS PID67988 保留。** 下方“待复审/未部署”段落是开发阶段的历史记录，以本段及末尾部署证据为准。

基线 `a3dabcc`；此修复先提交供复审，不部署。当前生产仍运行价格维护代码 `c75bf80`，app PID90048、TTS PID67988。本次不修改 stage、凭据、预算、模型、人设、后端服务或用户数据。

## 行为与范围

此前 voices 列表缺少首选时选中第一条神经声线，boot/普通设置保存把这个回退值写成首选，恢复服务也不会恢复原声线。修复后沿用原 settings version 2 的 voice/emotion 字段存首选，dropdown 表示当前有效选择，无新 storage schema 或密钥存储。

暂缺/失败时首选声线和表情保留；当前可用本地神经声线仅作临时回退，UI 明示首选保留。可用后“刷新声音”或既有声音列表更新会恢复首选，不生成声音。用户明确改选，或在临时回退态点击“将当前声线设为首选”，会成为新首选，不会在原声线恢复后抢回旧选择。按钮只在当前有可用临时回退时出现；确认不依赖下拉同值的 change 事件。没有神经声线时不自动选用系统声音。

现有删除记录中的 canRestore profile/emotion 和已确认操作通知用于区分明确删除。整个首选删除时取消首选并保存可用替代；删除其首选表情时归 neutral，恢复登记不覆盖后来的声线/表情选择。跨页和重开都通过已有删除元数据处理；元数据读取失败时保守保留首选，明确操作通知可作后备。成功读取当前元数据时优先使用它，避免迟到的旧删除通知撤销已恢复后重新选择的首选。

voices 刷新和 SpeechController 列表各有最新请求序号，迟到旧响应不会覆盖最新列表、状态或用户新选择。普通设置的 provider/source 枚举机制保持原样；没有新增“使用已保存密钥”按钮，没有自动读取 key/开启真实模式/发送请求。入口仅在设置与 START.md 提示 localhost/127.0.0.1 偏好独立和固定入口建议，不迁移 storage、不跳转页面。

## 验证与证据

- 完整单元 `111/111` 通过，包括新增临时缺失/恢复、明确删除/恢复选择、SpeechController 迟到列表回归。主 UI VM fixture 补新 policy 与删除元数据，并断言 boot 没有隐藏错误。
- 新浏览器 fixture 最终 **1/1 通过（33.3s）**，使用独立端口、临时 SQLite、隔离 profile、mock 列表/删除元数据/凭据，覆盖延迟 boot、临时 503、profile 缺席重开/恢复、普通设置变更不覆盖首选、用户在请求中改选、乱序刷新、删除元数据暂失时确认通知的后备、迟到旧删除通知不撤销当前恢复状态、明确删除/恢复/重新选用及表情删除恢复；模型/合成/预算 0，仅 fixture GET。
- 既有设置 roundtrip 与自动朗读取消回归已通过。参考录音删除/恢复/跨页/重启回归 **1/1 通过（55.7s）**；导入同 speaker、授权预览/丢弃/跨页/重启 **1/1 通过（1.4min）**。首次两个场景45s整项超时，导入在90s重跑仍超时；只屏蔽无关角色资产，将两场景时限分别设90/180s，并在导入 fixture 清理时先关闭页面再关闭临时 app。保留所有文件/API/音频 fixture 和断言；没有生产生命周期改动，不把这些时长视为 UI 性能基准。最终导入证据在 `import-final.log`。
- `build:review` 通过，输出只在 artifacts，现有 >500kB bundle 警告保留。OpenSpec `voice-preference-reliability` strict 通过；git diff --check 通过。
- 本机证据位于 `artifacts/voice-preference/`：`unit-final.log`、`browser.log`（含首次超时及设置/取消成功）、`reference-regression.log`、`import-final.log`、`preference-final.log`、`build.log`、fixture screenshot，以及 `before/quiet.json`。只读 quiet 核验生产 app90048、TTS67988、44 completed/reserve4.27920，数据/schema/报告/TTS 配置与实际静态包 hash 均和维护后基线相同。

尚未部署，也未操作用户正式页面或真实声音/模型；新 UX 的真实听感和恢复体验仍需用户在复审部署后自行操作。已有真实记忆召回不重跑；验收清单沿用 [日常 UX 与维护](daily-ux-pricing-maintenance-20260930.md) 的少量明确发送/听感/记忆来源检查。此步完成后没有需要新增的功能，只待复审部署和用户体验。

基线修复 b874434 的5个相关浏览器场景最终分别通过（新首选、设置、自动朗读取消、删除恢复、导入），不是宣称首次混合命令全通过。快速复审发现 native select 的同值选择通常不触发 change，故本补充加入上述明确按钮；真实浏览器不调用 selectOption/dispatchEvent，保持 fallback 当前值、点击确认，证明 change 计数 0、首选持久化、旧声线恢复和 reload 后仍用新首选，且无可用回退/恢复常态按钮隐藏。扩展原完整声线矩阵 **1/1 通过（34.2s）**；相关 voice-preference/memory-ui/settings 单元 **14/14 通过**；构建/OpenSpec strict/diff check 通过。本机新增 `same-value-unit.log`、`same-value-browser.log`、`same-value-build.log`。

最新审查包 HTML SHA256 `f2124d3ac409e293b0b7dafc11273c2f2a31d0860bd96345d82854debbfd9777`；JS `index-Biy85M02.js` SHA256 `bc431f9c21c58dd943de0e347d0d73322926c16637c8c39fb315d9ac0efdad84`；CSS 仍 `e677c043902edd7e0b7c9e595ca4ea8bb7c23082bb0a74c4fbc1c7ebb56bcc61`。这不是当前生产包。复审后才检查空闲并 app-only 更新；回滚此修复只需恢复当前旧 dist，后端核价代码、data、TTS 不应回退。

## 已批准部署与阶段结束

独立复审无阻断，按随后授权 app-only 部署上述批准版本。最终 `before/quiet` 只读检查无在途模型预留、starting/running 测试、TTS 活动/队列、app 客户端或外部连接，台账仍44 completed。既有 launcher 验证 PID90048、创建时间、绝对脚本和 health 身份后仅停止 app，替换批准的 dist，再启动 app **77220**，health ready，启动错误日志为空。未刷新用户页面、访问真实凭据或进行模型/声音付费调用。

`artifacts/voice-preference/deployment/after.json` 验证上述 HTML/JS/CSS SHA256 与服务实际返回、磁盘 dist、审查包三者一致；新增同值确认按钮在 served HTML。events11、memories1、remote_usage44 行全行摘要、schema、两份报告、TTS 配置和完整预算/价格记录前后完全相同。仍 **44 completed、reserve4.27920元、余额4.72080元**；没有新增用户调用。TTS worker **67988**、rootId/ready 原样。后端 server/scripts/package 与价格维护代码 c75bf80 无差异；价格24h失效时间仍2026-10-01 21:53:53 UTC。

旧 dist 的两个回滚副本保存在本机忽略目录 `deployment/rollback/dist/` 与 `dist-pre-swap/`；无需恢复 data 或后端价格代码。本次没有执行回滚。此后的交接文档提交不改变运行时代码。

剩余真人验收：用户自行在固定入口/同一 profile 刷新，确认演示模式和已选择的声线；按需明确试听/确认首选，再本人启用真实聊天并逐次发送，检查模型到真实音频衔接、停止体验、自然回复和记忆来源/回忆边界。此前已被旧版覆盖的偏好无法推断恢复，需要本人重新选一次。已有真实召回成功不重复收费测试；新提示服从性与角色听感尚未真实测量。没有剩余开发阻断，不再新增功能或主动付费操作。
