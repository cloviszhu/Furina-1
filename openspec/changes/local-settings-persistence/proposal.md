## Why

每次刷新重复填写模型和声音配置增加操作负担。用户明确批准普通配置自动恢复，并提供可选的本机 Windows 凭据管理器入口。

## What Changes

- 浏览器版本化保存非敏感配置，按白名单校验、迁移和损坏回退。
- 固定 DeepSeek 命名空间使用 Windows CredWriteW/CredReadW/CredDeleteW；用户明确保存/删除，禁止覆盖和明文回退。
- 已保存密钥读取前强制官方 HTTPS provider/endpoint 校验；只供本人明确启动的有界收费测试。
- 隔离假凭据测试、泄漏回归与安全交接。真实凭据保存及生产部署由用户/父协调执行。

## Capabilities

### New Capabilities
- `local-settings`: 普通设置持久化与当前用户本机凭据存储。

### Modified Capabilities

无；延续现有历史隔离、预算与测试报告约束。

## Impact

新增前端设置存储模块、Windows 系统 API 桥接、固定敏感路由及测试。无新依赖、管理员权限或安全设置修改，不触发真实 API。
