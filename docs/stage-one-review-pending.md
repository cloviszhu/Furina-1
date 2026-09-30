# 第一阶段独立 review 待修

复现基线 `17efdee94e43e0f07bb0f09196f5a6870e5440f9`。以下尚未修复；本阶段 TTS 集成不改变状态。

- **P1** `server/index.js` 先捕获 memory/history，再 await provider，之后无条件保存旧回复。期间 edit/delete 可让旧内容回流。需要 memory revision/generation invalidation、abort/discard stale response，以及延迟 provider + edit/delete regression。
- **P2** demo 近似词匹配后无条件“当然”误肯定冲突前提。例：记忆“我们在枫丹吃了蛋糕”，问“还记得我们在蒙德吃蛋糕吗”。应只描述相关记忆，不肯定不同地点/日期；需要对应测试。
- **P2** `src/main.js` 选择聊天来源后 `memorySourceId` 残留。删改记忆清理 history 后，旧 pending source 导致后续保存持续 validation 失败。需要 reset/revalidate 与手动记录选项。

review 未发现直接密钥跨域或预算绕过；不代表全部运行功能已独立审完。真实 DeepSeek 测试前必须重新核对官方价格，由用户本人最终导入 key。
