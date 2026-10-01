## ADDED Requirements

### Requirement: Bounded ordered segments
系统 SHALL 在一次完整安全回复后提供同一 turnId 的连续段索引与明确 emotion；最多10段、每段300、总文本1500，拼接等于原文，不称LLM streaming。
#### Scenario: Completed reply
- **WHEN** 客户端显式发送有效新 UUID
- **THEN** 返回 generationState completed 和有序 segments，保留旧字段，仅一次模型请求。

### Requirement: Cancellation invalidates late work
系统 MUST 对生成及TTS传播取消，并拒绝忽略abort的迟到结果；取消预留不退款，真实请求settle前互斥。
#### Scenario: Cancellation wins race
- **WHEN** cancel先于chat或生成未返回时到达
- **THEN** 本轮不能提交对话历史或音频，返回TURN_CANCELLED，后续新UUID可以恢复。
#### Scenario: Cancel delivered speech
- **WHEN** 文本已经送达，用户取消合成或播放
- **THEN** 迟到WAV不得返回，已有效交付历史保留。

### Requirement: Honest errors and compatibility
系统 SHALL 保留旧调用、凭据与预算规则，并为新合同提供失败状态，不以离线回复冒充模型失败后的成功。
#### Scenario: Provider or TTS failure
- **WHEN** 模型或TTS失败
- **THEN** 返回可恢复错误且不自动重试；失败生成不写历史，TTS失败保留已交付文本。

### Requirement: Test provenance and bounded memory derivation
系统 MUST 排除显式 remoteTest 回合的自动长期捕获，保留测试来源标记，不改写既有历史或手动确认记忆；每 episode typed claims SHALL 去重并最多12个，每次检索 SHALL 默认最多24次 capsule 导出（包括超预算跳过项），每 claim 最多核查128个 peers，截断时明确标注核查不完整。
#### Scenario: Explicit test input resembles a factual statement
- **WHEN** remoteTest 为 true 且输入普通第一人称事实
- **THEN** 原短期历史保留、来源标记 test、memoryCapture 不保留，不生成自动 episode；正式成功聊天仍自动捕获。
#### Scenario: Repeated clauses and oversized capsules
- **WHEN** 多个 episode 含重复或大量不同 clauses 且 capsule 超出字节预算
- **THEN** 原文保留，typed claims 和导出次数有界，达到工作预算返回 hasMore；未完成冲突核查不能声称没有冲突。

### Requirement: Product quality acceptance boundaries
系统 MUST 将有序播放、生成和TTS取消、模式切换、迟到结果、故障恢复及历史记忆隔离纳入统一离线验收；自然idle、协调招呼、姿态过渡和自然长期记忆 SHALL 在后续集成验证中保留为核心验收项。
#### Scenario: Engineering checks complete
- **WHEN** 服务端确定性检查通过
- **THEN** 只报告对应工程证据，真实角色、声线和活人感不宣称已验收，不要求用户逐补丁API测试。

### Requirement: Licensed resting motion with planted feet
stage SHALL 用明确许可的本地待机动作源适配实际 PMX reference pose、肢段方向与腿长，并保持脚踝位置及脚底世界朝向稳定。源采样 MUST 与真实骨架每帧重置隔离，避免 mixer 常量轨道缓存丢失。分发数据 SHALL 只包含合法源 rig 数据，不包含用户 PMX、纹理或目标骨架坐标。
#### Scenario: Idle, greeting and cancellation
- **WHEN** 从 idle 进入既有 greet，途中取消并回到 idle
- **THEN** 源 idle 渐出及渐入，保留动作重入拒绝与旋转速率边界，口型/眨眼/表情仍由原 stage 负责，不触发聊天、语音或模型调用
#### Scenario: Unavailable rig or explicit resting pose
- **WHEN** 模型缺少适配所需的骨链，或用户选择既有明确 idleVariant
- **THEN** 保留既有程序化姿态与动作 API，不因待机适配失败阻断模型加载
#### Scenario: Visual acceptance
- **WHEN** 两形态完成至少30秒idle及至少10秒idle→greet→cancel→idle隔离序列
- **THEN** 分别检查倒置、脚漂/脚底朝向、膝过伸、手/衣摆穿模及过渡；数值与测试只作对应工程证据，不宣布自然度或角色活人感完成
