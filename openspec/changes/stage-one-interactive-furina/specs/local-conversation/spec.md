# Spec Delta

## Purpose

建立在本机运行的角色会话入口，将人设、相关共同经历与用户输入交给可替换模型服务，并明确展示服务是否真实可用，在没有模型服务时以有限演示反馈保持界面可测试而不误报能力。

## ADDED Requirements

### Requirement: Persona and honest provider status

系统 SHALL 接收用户文字，使用芙宁娜角色设定和相关记忆构建模型上下文。模型不可用时 SHALL 明示本地规则演示模式或服务故障，不把规则模板声称为真实 LLM；未知经历 SHALL 不编造。

#### Scenario: Unknown experience
- **WHEN** 用户询问尚未记录的共同经历
- **THEN** 演示模式说明未找到证据；模型提示同样要求承认未知而不是补写经历

#### Scenario: Provider failure
- **WHEN** 已配置模型服务超时或返回无效内容
- **THEN** 页面显示故障及当前回复来源，输入与记忆仍可用

### Requirement: Local boundaries and excluded assets

服务 SHALL 仅监听 loopback，拒绝跨来源写请求和目录越界读取，限制输入大小；Git SHALL 排除用户受限制资产、声音素材、训练数据、运行记忆、模型权重与凭证。

#### Scenario: Unsafe request
- **WHEN** 外部来源尝试写入或请求项目外路径
- **THEN** 请求被拒绝，不读取项目外文件或写入数据

#### Scenario: Repository audit
- **WHEN** 准备提交和推送
- **THEN** 索引中没有受限制模型/贴图/附件、用户会话数据或秘密

### Requirement: Configurable providers and models

系统 SHALL 提供 OpenAI/GPT、GLM、DeepSeek、Claude、Kimi、通用兼容端点和本地模型配置，允许切换提供商与模型。默认模型与密钥 SHALL 留空，不读取其他应用凭证；用户输入的密钥 SHALL 仅用于当前显式请求，不持久化或记录。协议兼容测试 SHALL 与真实联网测试分别报告，未获具体授权 SHALL 不自动调用收费 API。

#### Scenario: Empty configuration
- **WHEN** 用户首次打开设置
- **THEN** 模型和密钥为空，可选择提供商，聊天显示有限演示模式

#### Scenario: Switch a provider
- **WHEN** 用户切换 Claude 或兼容提供商并明确配置模型
- **THEN** 后续请求使用对应协议，页面显示实际回复来源；失败不声称该模型已成功回应

### Requirement: Bounded authorized remote tests

系统 SHALL 在用户亲自输入凭证后才允许其显式触发已授权的 DeepSeek 少量测试，本轮累计费用上限为人民币 9 元，不自动充值或重试。系统 SHALL 在调用前按已核实的官方价格保守预留费用，并限制调用数、输入大小和输出 token，保存不含秘密的用量记录；无法核实价格或保证预算时 SHALL 拒绝调用。其他远程服务 SHALL 保持禁用。

#### Scenario: No credential
- **WHEN** 用户未输入密钥或未明确选择一次远程测试
- **THEN** 不发送远程模型请求，继续支持本地演示

#### Scenario: Budget exhausted
- **WHEN** 调用数或费用预留已达到上限，或价格核实已过期
- **THEN** 后续调用在网络请求前被拒绝，重启不清空累计用量
