# 声线首选可靠性修复交接

基线 `a3dabcc`；此修复先提交供复审，不部署。当前生产仍运行价格维护代码 `c75bf80`，app PID90048、TTS PID67988。本次不修改 stage、凭据、预算、模型、人设、后端服务或用户数据。

## 行为与范围

此前 voices 列表缺少首选时选中第一条神经声线，boot/普通设置保存把这个回退值写成首选，恢复服务也不会恢复原声线。修复后沿用原 settings version 2 的 voice/emotion 字段存首选，dropdown 表示当前有效选择，无新 storage schema 或密钥存储。

暂缺/失败时首选声线和表情保留；当前可用本地神经声线仅作临时回退，UI 明示首选保留。可用后“刷新声音”或既有声音列表更新会恢复首选，不生成声音。用户明确改选（包括选中当前临时回退）会成为新首选，不会在原声线恢复后抢回旧选择。没有神经声线时不自动选用系统声音。

现有删除记录中的 canRestore profile/emotion 和已确认操作通知用于区分明确删除。整个首选删除时取消首选并保存可用替代；删除其首选表情时归 neutral，恢复登记不覆盖后来的声线/表情选择。跨页和重开都通过已有删除元数据处理；元数据读取失败时保守保留首选，明确操作通知可作后备。成功读取当前元数据时优先使用它，避免迟到的旧删除通知撤销已恢复后重新选择的首选。

voices 刷新和 SpeechController 列表各有最新请求序号，迟到旧响应不会覆盖最新列表、状态或用户新选择。普通设置的 provider/source 枚举机制保持原样；没有新增“使用已保存密钥”按钮，没有自动读取 key/开启真实模式/发送请求。入口仅在设置与 START.md 提示 localhost/127.0.0.1 偏好独立和固定入口建议，不迁移 storage、不跳转页面。

## 验证与证据

- 完整单元 `111/111` 通过，包括新增临时缺失/恢复、明确删除/恢复选择、SpeechController 迟到列表回归。主 UI VM fixture 补新 policy 与删除元数据，并断言 boot 没有隐藏错误。
- 新浏览器 fixture 最终 **1/1 通过（33.3s）**，使用独立端口、临时 SQLite、隔离 profile、mock 列表/删除元数据/凭据，覆盖延迟 boot、临时 503、profile 缺席重开/恢复、普通设置变更不覆盖首选、用户在请求中改选、乱序刷新、删除元数据暂失时确认通知的后备、迟到旧删除通知不撤销当前恢复状态、明确删除/恢复/重新选用及表情删除恢复；模型/合成/预算 0，仅 fixture GET。
- 既有设置 roundtrip 与自动朗读取消回归已通过。参考录音删除/恢复/跨页/重启回归 **1/1 通过（55.7s）**；导入同 speaker、授权预览/丢弃/跨页/重启 **1/1 通过（1.4min）**。首次两个场景45s整项超时，导入在90s重跑仍超时；只屏蔽无关角色资产，将两场景时限分别设90/180s，并在导入 fixture 清理时先关闭页面再关闭临时 app。保留所有文件/API/音频 fixture 和断言；没有生产生命周期改动，不把这些时长视为 UI 性能基准。最终导入证据在 `import-final.log`。
- `build:review` 通过，输出只在 artifacts，现有 >500kB bundle 警告保留。OpenSpec `voice-preference-reliability` strict 通过；git diff --check 通过。
- 本机证据位于 `artifacts/voice-preference/`：`unit-final.log`、`browser.log`（含首次超时及设置/取消成功）、`reference-regression.log`、`import-final.log`、`preference-final.log`、`build.log`、fixture screenshot，以及 `before/quiet.json`。只读 quiet 核验生产 app90048、TTS67988、44 completed/reserve4.27920，数据/schema/报告/TTS 配置与实际静态包 hash 均和维护后基线相同。

尚未部署，也未操作用户正式页面或真实声音/模型；新 UX 的真实听感和恢复体验仍需用户在复审部署后自行操作。已有真实记忆召回不重跑；验收清单沿用 [日常 UX 与维护](daily-ux-pricing-maintenance-20260930.md) 的少量明确发送/听感/记忆来源检查。此步完成后没有需要新增的功能，只待复审部署和用户体验。

5 个相关浏览器场景最终分别通过（新首选、设置、自动朗读取消、删除恢复、导入），不是宣称首次混合命令全通过。审查包 HTML SHA256 `09b7b7b4d1c0079fdde6dac9edd0e46b7f50c81b822d7f068e646c60a0a33ad9`；JS `index-CGkVY8DR.js` SHA256 `a2ea9f67d615140d15763afe8a1cd57344c2863f55bf1421f923e55993be1175`；CSS 仍 `e677c043902edd7e0b7c9e595ca4ea8bb7c23082bb0a74c4fbc1c7ebb56bcc61`。这不是当前生产包。复审后才检查空闲并 app-only 更新；回滚此修复只需恢复当前旧 dist，后端核价代码、data、TTS 不应回退。
