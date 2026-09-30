## ADDED Requirements

### Requirement: Recoverable custom reference removal
系统 SHALL 提供用户显式确认的自定义声线／非 neutral 表达删除与本地恢复入口。系统 MUST 仅解绑并删除本应用导入的受管理副本，保留可恢复副本及登记元数据，不删除内置 RAVDESS、原始录音或任意外部路径。运行／排队／登记更新期间 MUST 拒绝修改。删除当前引用后 SHALL 同步本页及同源标签页可用声线和表达，不能自动启用系统语音。

#### Scenario: Delete selected expression or profile
- **WHEN** 用户确认删除自定义非 neutral 表达或整个声线，且队列空闲
- **THEN** 登记原子移除，已删除引用不能再合成，其它 speaker 和原始录音不变，选择回退并显示本地恢复记录

#### Scenario: Restore after restart
- **WHEN** 用户重启后显式恢复删除记录
- **THEN** 校验受管理路径和音频 SHA256，并在不覆盖现有登记／文件的条件下恢复原 speaker 与表达

#### Scenario: Busy or unsafe removal
- **WHEN** 生成／排队中、目标为内置声线或重定向路径、恢复与现有登记冲突
- **THEN** 系统拒绝操作，保留现有登记和可恢复材料

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
