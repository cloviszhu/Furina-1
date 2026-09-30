# Proposal

## Why
真实交谈需要反复进入设置点单次测试，普通发送始终演示，容易误解回复来源。

## What Changes
- 主聊天明确区分演示与本人启用的真实 DeepSeek 模式；每次发送单独授权调用。
- 记住普通配置和密钥来源偏好，刷新不恢复收费开关；快捷提示只填文字。
- 取消、连击、切模式、错误和预算状态可见，保留既有安全边界。
- 小范围约束无依据的关系指责。

## Capabilities
### New Capabilities
- `explicit-chat-mode`: 明确授权的正式聊天流程。
### Modified Capabilities
无。

## Impact
聊天前后端、设置白名单、隔离测试和交接文档；聊天实现不改 stage.js；后续按用户追加授权集成动作分支，不操作生产服务或真实凭据。
