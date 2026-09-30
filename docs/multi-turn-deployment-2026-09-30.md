# 多轮契约修复 app-only 部署

2026-09-30。父任务独立只读复审 `ebd906ff02f0acea1e8275d0a26998c07fab9d72` 通过，并明确授权仅更新本项目 app。修复代码提交为 `dc85158093a11650ad85f08fd439951acdf58ae5`。

部署前两次检查：app PID85080、ready=true；25 条预算记录全部 completed，无 reserved 在途项；安全报告列表只有已完成的18步报告，无 starting/running 测试；app TCP 无外部模型连接，只有本地 TTS 健康连接。TTS PID67988、ready=true、active=false/pending=0。

通过项目 launcher 核对绝对入口、可执行文件、创建时间及健康 rootId 后，执行 `stop --app-only` 与 `start --app-only`。新 app **PID78928 / 3000 / ready=true**，加载上述已复审版本。TTS **PID67988 / 9880 / ready=true** 保留，无停止或重启。健康 rootId 前后一致。环境短暂断开通知到达时 app 已启动并通过验证；再次只读核对保持可用，没有重复生命周期或真实模型请求。

## 保留与验证

- 完整安全 budget 对象部署前后逐字段相等：usedCalls=25，全部 completed，预留 ¥2.04470（浮点原值2.0446999999999997），剩余 ¥6.95530，既有9元限额。25 条 remote_usage 原行摘要哈希完全一致。
- 4 条 events 的原有全部字段摘要哈希不变，memories 原行摘要哈希不变。仅新增可空 emotion 列，所有旧行仍 null，不伪造 neutral，不改写、删除或回填原行。
- 报告列表与报告文件 SHA256 前后相等，原18步报告未迁移或改写。跨会话 fixture 仍为 persistence:not-tested。
- HTTP served HTML、`index-BautWXUh.js`、`index-C8Uueq6V.css` 分别与本地 dist SHA256 相等。此次修改主要在服务端，静态包哈希与上版一致是预期结果。
- 数据核对使用只读 SQLite，私有文字仅在本地内存计算摘要，不输出或保存原文。证据保存在 Git 忽略的 `artifacts/multi-turn-deployment/{before,after}.json` 与 `verify.mjs`，只包含健康、数字预算、计数、schema及摘要，不包含凭据或私有对话。
- 未访问任何真实 credential API、CredMan、key文件、浏览器密码框或环境秘密；已存凭据完全未触碰。未刷新或操作用户页面，未发起聊天、speech、收费测试或其他真实模型请求。

## 验收边界

此前92/92 Node、3/3隔离Edge、build、OpenSpec strict均通过；部署验证只覆盖健康、数据保留及静态包一致性。真实模型多轮契约、情绪、认识边界与角色自然度仍须用户下一轮明确启动验证。

`structured=true` 表示解析和规范化后得到有效 text/emotion 契约；解析器兼容去除 JSON 代码围栏，因此它不证明原始模型输出必然是无围栏的纯 JSON。不得把该标志或 mock 通过升级为真实角色质量通过。跨会话记忆仍未测试。
