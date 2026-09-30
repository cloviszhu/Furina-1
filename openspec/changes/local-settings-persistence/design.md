## Context

当前设置只在页面内存中；后端已提供累计九元预算、十八步隔离测试和安全报告。当前进程及正式 DB 不可为开发验收重启或清理。

## Goals / Non-Goals

目标：普通选项自动恢复；提供当前用户此电脑的可选 DeepSeek 存储；密钥不回浏览器；假替身证明安全边界。

非目标：保存其他服务密钥、自动收费、增加预算、精修声线或部署当前服务。

## Decisions

- localStorage 仅保存版本和白名单字段；不保存密钥、带凭证 URL、聊天、费用模式。仅项目 neural profile 的稳定 ID 可恢复，浏览器声音索引不可当身份持久化。
- 剧情时点和风格在首次读取历史前恢复；现有同时间线风格连续、跨时间线隔离不变。不持久化自动朗读开关。
- checked-in PowerShell/C# PInvoke 调用 Advapi32，固定 target `ProjectExo/Furina-1/DeepSeek/APIKey/v1`、CRED_TYPE_GENERIC、CRED_PERSIST_LOCAL_MACHINE=2。本机同用户后续登录可用，无 Enterprise 漫游。
- 输入只经私有 stdin 管道；系统响应只在后端消费。错误只保留安全枚举及数字原生错误码。无 secret argv/env/文件、无明文回退。
- 读取前验证 DeepSeek 官方 HTTPS origin 及 /、/v1 路径，包括 loopback 拒绝；保存状态只返回布尔。
- 不覆盖任何已有凭据；固定 owner 标记不符时拒绝读取和删除。命名 mutex 序列化桥接操作。
- 敏感入口要求固定路径、同来源、Host、Sec-Fetch-Site、自定义请求头及 JSON。用户点击明确保存/删除按钮；首次真实保存不由开发测试执行。

## Risks / Trade-offs

同 Windows 用户的其他进程可能访问凭据，不宣称绝对隔离。无法使用系统 API 时报告未保存，不切换文件存储。真实库验收须用户首次亲自保存；本阶段只编译桥接结构及 mock 验证。

## Migration Plan

普通配置 v1 到 v2 只迁移已知字段；未知版本/损坏内容安全回退。无 DB 迁移或历史删除。新代码须后续 app-only 部署，运行中的 3000/9880 保持原样。

## Open Questions

无阻碍实现的问题；真实用户首次保存及实际读取需后续用户验收。
