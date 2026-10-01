## 1. 实现与验证
- [x] 1.1 实现离线 route handler 与边界，通过隔离 HTTP/进程测试核验校验、取消、互斥、清理。
- [x] 1.2 实现前端状态机及最小 composer 接线，通过 fake media 单元及 browser 测试核验编辑、迟到、取消、显式发送。
- [x] 1.3 用既有批准 WAV 完成一次真实 Whisper HTTP 路径验证，运行全量单元/build及专属 browser，自测证据写交接。
- [x] 1.4 提交隔离分支并交付 route 注册合同，git status 清洁且不推 main/部署。

## 2. 完整应用接线
- [x] 2.1 在原来源门禁后注册handler，关闭时先停止接收连接再取消并等待ASR清理。
- [x] 2.2 验证实际app HTTP与recording controller联合草稿路径，不自动聊天、费用或记忆写入；验证来源门禁、预取消、活跃取消和关闭清理。
- [x] 2.3 修复满容量挤掉旧预取消记录，128满时新记录429，60秒TTL边界确定性核验；目标检查/build/OpenSpec通过，仅推开发分支供review。
