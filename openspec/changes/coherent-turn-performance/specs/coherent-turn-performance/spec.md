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

### Requirement: Product quality acceptance boundaries
系统 MUST 将有序播放、生成和TTS取消、模式切换、迟到结果、故障恢复及历史记忆隔离纳入统一离线验收；自然idle、协调招呼、姿态过渡和自然长期记忆 SHALL 在后续集成验证中保留为核心验收项。
#### Scenario: Engineering checks complete
- **WHEN** 服务端确定性检查通过
- **THEN** 只报告对应工程证据，真实角色、声线和活人感不宣称已验收，不要求用户逐补丁API测试。
