# Design

## Context

现有 Node loopback 服务提供 SAPI WAV，前端 AudioContext 负责播放与振幅口型。4060 Laptop 有 8188 MiB 显存，初测已占 2244 MiB；可用 RAM 约 5.7 GiB。动机见 proposal.md。

## Goals / Non-Goals

**Goals:** 官方成熟核心的可重复本地部署；以单次、短句、半精度基线核对资源；自写 HTTP 适配层不绑定角色训练权重。

**Non-Goals:** 无许可素材克隆、从零训练、收费调用、对实际角色相似度做未经试听的承诺。已有记忆竞态及 demo 误肯定单独列入交接，避免同目录多人修复。

## Decisions

1. GPT-SoVITS v2ProPlus。IndexTTS-2.5 情绪解耦更强，但自定义协议明确把下载视为接受，用户尚未接受；本轮不下载。GPT 官方代码和权重标注 MIT。
2. portable uv/Python 与虚拟环境全部在 `.runtime/`；仅安装推理依赖和当前版本必需权重，不装训练/ASR/UVR 模型。CUDA wheel 不要求管理员 Toolkit。
3. Node 对上游仅允许数字 loopback HTTP、禁止重定向、固定 /tts 路由；参考 ID 映射到服务端本地登记，网页不能提供文件路径。参考的来源和使用许可必须登记；无角色素材使用合法测试 reference。
4. 情绪是 reference profile 的选择，不能声称拥有独立向量控制。文本与情绪分开，不将控制标签插入朗读文字；不支持的情绪明确拒绝。
5. v2ProPlus 核心本身共享可变状态；Node 串行调度、队列有界，取消先停止网页播放并丢弃迟到结果，上游推理不能可靠中断时保持占用直到完成，不提前运行下一任务。第一版本返回完整 WAV，stream 能力为 false。

## Risks / Trade-offs

- RAM/VRAM 不足 → batch=1、FP16、先测 GPU 与短句，超阈值结束本项目 TTS 进程，保留实证障碍。
- reference 的情绪可能改变声线 → 同句跨情绪录音与来源记录；缺样本不假装情绪效果验收。
- 取消无法节省上游计算 → 明确区分播放/投递取消和 GPU 任务中断，实测队列不会交叠。
- 上游依赖版本变动 → 固定源码提交、导出锁定环境，官方源下载记录。

## Migration Plan

保留现有备用声音；新后端仅在部署/登记/探测后显示可选。项目服务仅在确认 PID 后重启。回滚移除配置即可使用 SAPI，不删除用户素材。
