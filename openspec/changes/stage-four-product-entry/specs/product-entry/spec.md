## ADDED Requirements

### Requirement: User supplied local reference
系统 SHALL 仅处理用户上传的有界 PCM16 WAV，检查 3–10 秒、格式、静音与削波；输出规范化预览，并在用户确认转写、语言、权利、profile、情绪与同说话人后才登记。不同 emotion SHALL 归属同一 speaker。系统 MUST 不接受任意本地路径或下载录音；数据 MUST 不进入 Git。

#### Scenario: Preview before registration
- **WHEN** 用户上传有效录音
- **THEN** 系统返回有限时本机预览，尚不增加声线；确认后原子登记且立即可选

#### Scenario: Unsafe or mismatched input
- **WHEN** 录音格式/大小/时长/声学检查失败，或同 profile 的 speaker 不一致
- **THEN** 不登记且给出可操作说明，不读取其他路径

### Requirement: Safe local service lifecycle
入口 SHALL 提供状态、启动、停止；只复用或停止通过项目入口路径和健康标识核对的进程。系统 MUST 拒绝无关端口占用，不提权、不自启、不改安全设置、不自动下载。

#### Scenario: Existing or foreign listener
- **WHEN** 项目端口已经监听
- **THEN** 已核对项目实例可复用，无关实例明确拒绝且不终止

### Requirement: Decoded provider output safety
系统 MUST 对解析后的回复再次检查当前密钥泄露，输出和 usage 使用白名单。

#### Scenario: Unicode escaped fake key
- **WHEN** provider JSON 包含转义的当前假密钥
- **THEN** 解码后的回复被拒绝，不持久化、不朗读

### Requirement: Stable memory source validation
系统 SHALL 按 eventId 和角色上下文验证已选用户聊天来源，不能把最近历史窗口之外的记录误判为删除；验证失败 MUST 保留编辑草稿。

#### Scenario: Early visible conversation source
- **WHEN** 用户经过九轮以上聊天后选择仍可见的早期消息
- **THEN** 仍存在的来源可保存，来源检查不依赖最近十六条记录
