## ADDED Requirements

### Requirement: Nonsecret settings persistence
The application SHALL 自动保存并恢复有效 provider/model/baseURL、项目声线、表达、语速、剧情时点和语言风格；不保存 API key、带凭证 URL、聊天或预算。版本迁移及损坏内容 SHALL 安全回退。

#### Scenario: Reload configured app
- **WHEN** 用户刷新已经配置的页面
- **THEN** 普通选项恢复，密钥输入为空，历史仍依照原时间线规则恢复，收费测试不启动

#### Scenario: Invalid storage
- **WHEN** 内容损坏、版本未知或字段非法
- **THEN** 应用使用安全默认值或有效白名单字段，不读取或恢复任意敏感字段

### Requirement: User-confirmed Windows credential storage
The application SHALL 仅在用户明确保存/删除操作时使用当前用户本机 Windows 凭据管理器固定 DeepSeek target；MUST 使用系统 API 和本机持久模式，不枚举、覆盖其他凭据或回退明文。

#### Scenario: Explicit save
- **WHEN** 用户输入密码框并点击保存到本机 Windows 凭据管理器
- **THEN** 系统保存固定项目凭据，成功后页面清空，状态只返回布尔，不产生 API 费用

#### Scenario: Unavailable or existing credential
- **WHEN** 系统 API 不可用、原生错误或已有凭据
- **THEN** 操作安全失败，不覆盖或写明文，不返回密钥或异常原文

### Requirement: Controlled saved key use
The backend MUST 在 CredRead 前验证 provider=deepseek、官方 HTTPS origin 和允许 path，拒绝 loopback/其他域名；API SHALL 永不返回保存的 key。

#### Scenario: Malicious custom endpoint
- **WHEN** 使用已保存密钥的请求指定 localhost、自定义域名或其他 provider
- **THEN** 读取凭据前拒绝且不产生模型调用

#### Scenario: Explicit bounded test
- **WHEN** 用户本人启动一次短测试或十八步自动测试并选择已保存密钥
- **THEN** 后端读取固定凭据供受控请求使用，保留原累计九元预算、失败停止和报告安全约束

### Requirement: Isolated verification
Development verification SHALL 使用假密钥/mock桥接、独立临时 DB 和 loopback 动态端口，不操作真实凭据库或现有服务。

#### Scenario: Regression verification
- **WHEN** 执行构建、单元及浏览器验收
- **THEN** 原有历史、预算、声音 profile 和运行服务保持不变，fake key 不出现在 storage/history/report/API body

### Requirement: Secret-free PowerShell bootstrap
The credential bridge MUST 只通过 PowerShell 编译静态 C# 并调用无参数 void 入口；秘密解析、Cred API、序列化和私有 OS 管道 I/O SHALL 全部留在 C#，秘密不能经过 PowerShell cmdlet、变量、输出管道或 ErrorRecord。

#### Scenario: Logging enabled in an isolated fixture
- **WHEN** 使用 Cred API 替身和随机假 sentinel，在本进程启用 transcription 和模块日志进行验证
- **THEN** 旧 JSON cmdlet 路径作为泄漏对照，修复路径不把 sentinel 送入 PowerShell 日志；不改变持久安全/日志策略，不读取其他进程日志

#### Scenario: Malformed private input
- **WHEN** stdin JSON 损坏、超限或含非法字段/类型
- **THEN** C# 内部捕获并仅向私有 OS 管道返回固定安全错误，PowerShell 不接收秘密或异常原文
