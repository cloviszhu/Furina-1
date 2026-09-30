## 1. 实现与验证

- [x] 1.1 实现非敏感配置白名单、迁移、安全回退和启动恢复顺序。
- [x] 1.2 实现固定 DeepSeek Windows 系统 API 桥接、本机用户持久、不可覆盖和安全错误。
- [x] 1.3 实现同来源敏感 API 与用户明确保存/删除/已保存密钥选择；读取前限制官方端点。
- [x] 1.4 完成独立 DB/mock 单元、泄漏与浏览器回归、build 和 OpenSpec strict。
- [x] 1.5 记录未执行的真实凭据验收及部署边界，提交并核对同仓库 main 推送。

## 2. 独立安全审查修复

- [x] 2.1 移除秘密经过 PowerShell cmdlet/变量/输出管道的路径，使用 C# 无参数 void 入口处理解析、Cred API、序列化和私有 OS 管道。
- [x] 2.2 使用假 sentinel 和 Cred API 替身验证协议及本进程 transcription/module logging，保留旧路径泄漏对照，不改变持久日志或安全策略。
- [ ] 2.3 完成回归、build、OpenSpec、修复交接与提交，提供完整 SHA 供复审，不部署或操作真实凭据。
