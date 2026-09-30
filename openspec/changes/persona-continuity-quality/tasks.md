# Tasks

## 1. 角色与连续性

- [x] 1.1 精简 persona、记录来源边界与人工审核标准；检查时间线与风格提示。
- [x] 1.2 实现同时间线旧键兼容读取；临时 DB/HTTP 验证风格保留前提、时间线隔离及记录无损。

## 2. 多轮测试

- [x] 2.1 实现六组三轮真实 history、语义 fixture 与新会话未测标记；mock 验证十八次序列、组间隔离、逐次预算、失败无重试和取消。
- [x] 2.2 扩展安全报告与 UI，保留旧报告读取；验证 prompt/fixture/history allowlist、凭证拒绝和报告上限。

## 3. 交付

- [ ] 3.1 运行隔离测试、build、OpenSpec strict；记录证据、commit/push 核对与待部署交接。（测试/build/strict/本地 commit 与交接完成；push 被自动审批拒绝，待父协调处理授权。）
