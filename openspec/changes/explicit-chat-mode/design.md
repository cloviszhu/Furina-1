# Design

## Context
现有 remoteTest 单次调用和固定 CredMan/官方 endpoint 已审查。累计预算保持 9 元、128 输出 token、输入限制和失败预留。

## Goals / Non-Goals
真实聊天在主页面连续使用；不引入密钥存储、自动请求或自动重试，不部署。

## Decisions
真实开关只存页面内存。remoteChat 与 confirmed=true 一起发送，并保留旧测试入口。服务端在凭据访问前验证授权并串行化聊天；断连传递 AbortSignal，预留不退，取消结果不写历史。真实失败直接错误，不生成貌似真实的演示回复。记住 credentialSource 只代表偏好，不读取 key。建议按钮显式应用 deepseek-flash，保留自定义模型。

## Risks / Trade-offs
取消不保证上游未计费 → 提示预留保留且刷新预算。多页并发 → 服务端拒绝重叠聊天，客户端阻止连击。刷新回演示 → 明确状态并保留配置。未部署的新流程尚无真实模型验收 → 只报告 mock 验证。

## Migration Plan
先提交推送代码、隔离测试证据和文档。生产部署另行授权；回滚为上一提交，不迁移生产数据库。
