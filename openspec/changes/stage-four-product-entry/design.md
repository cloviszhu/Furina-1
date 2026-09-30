## Context
Windows 普通权限，现有 GPT-SoVITS 和 PMX。参考数据与运行状态不进入 Git。首版入口明确接受 PCM16 WAV，其他格式给出离线转换提示，不解析任意文件路径或下载音频。

## Goals / Non-Goals
用户确认之前只产生有时限的本机预览；登记后可立即切换。不同表达仅追加到同说话人 profile。声纹相同由用户核对，机器不保证身份。不是训练或角色相似度验收；不自动写入事实记忆。

## Decisions
自定义删除只接受带 managed、speakerId、importedAt 元数据的 import-UUID.wav 受管理副本，精确校验目录／文件 canonical 路径并拒绝 junction、共享引用和登记冲突。与导入／TTS 共用提交锁，active 或 pending 时 409；neutral 只能随整个 profile 删除。先复制校验音频和 manifest 到 data/tts-reference-trash/UUID，再原子提交移除登记，最后仅 unlink 已知副本；崩溃时保留恢复材料，未登记残留不能再合成。恢复检查 SHA256、不覆盖已登记表达／profile／不同文件，并复用完整配置校验。恢复记录最多二十条，不自动清空，不操作上传来源文件。网页二次确认、播放取消、可用声线／neutral 回退与 BroadcastChannel 同步；无可用神经声线时不自动改用系统语音。
二进制有界上传，不接受路径或使用原始文件名。只解析严格 PCM16 WAV，输出新生成 mono 32kHz PCM16 并去除非音频块。检查原始声道避免降混掩盖削波，高采样率用加窗 sinc 低通后重采样，其他采样率线性重采样，只衰减峰值不放大噪声，不补救过短/过长或削波录音。预览令牌随机、十分钟失效，最多三个暂存；确认需完整元数据及勾选授权、预览和同说话人。
配置原子写入前完整校验并串行确认；忙时拒绝修改、不会替换 LocalTts 队列实例。Node 启动工具通过普通权限 Windows 原生命令检测端口、健康标识、进程 executable 和完整入口路径，拒绝无关占用；进程创建时间收据与互斥锁避免冷启动重复。启动不安装依赖，关闭不按进程名批量杀进程，不改变 PowerShell 默认执行策略。

## Risks / Trade-offs
TTS超时隔离后GPU状态不确定，即使Node active已清零也拒绝删除／恢复，须先重启TTS和app；不能通过解绑来绕过未释放计算。用户本人接入期间不重启／刷新其页面。
PCM16 WAV 首版限制避免添加编解码依赖；噪声、听感、同说话人仍需人工判断。上游 TTS 取消不终止 GPU 工作，入口明确等待队列释放。Windows 沙箱可能阻止进程查询，普通本机工具需 fail closed。

## Migration Plan
保留现有 RAVDESS 测试 profile，不覆盖未经管理入口登记的 reference；旧 registry 无 speakerId 时禁止追加情绪参考。新导入需 neutral 起步。
