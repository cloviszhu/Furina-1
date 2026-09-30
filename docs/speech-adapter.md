# 声音适配器状态

当前已接入官方 GPT-SoVITS v2ProPlus，系统声保留为临时备用。完整部署与登记说明见 [本地 TTS](local-tts.md)，实际测量见 [第二阶段验收](stage-two-validation.md)。

`/api/status` 返回静态 `speechBackends` 能力与动态 `localTts.ready/error/voices`；每份声音的 `emotions` 只列真实登记 reference。`/api/voices` 仅枚举当前可用的本地声音。

```text
POST /api/speech
{ backend: "gpt-sovits", text, referenceId, emotion: "neutral", speed: 1 }
  -> 完整 PCM16 WAV
```

前端 AbortController 与 generation sequence 阻止取消后的迟到音频播放。Node 有界串行队列不因客户端断线提前释放 GPU 槽位。`cancel=true` 表示播放/投递取消，`hardCancel=false`、`stream=false`；不能把官方 API 的能力当成本项目已完成。

表达控制通过同一人不同情绪录音的 reference profile，未实现独立 emotion vector。路径只在本地登记配置中，网页不传任意路径。控制标签拒绝，不插入正文。

当前获许可 reference 是非商业测试数据，角色声线/人工表达质量验收未完成。没有参考角色项目代码复制，没有训练，没有 Index 自定义许可接受或付费语音调用。

本机 RTX 4060 Laptop/约 16 GiB RAM；真实六表达同句 baseline 和资源测量已完成，人工试听结论尚缺。先取得允许的角色参考并评估零样本输出，再判断训练。
