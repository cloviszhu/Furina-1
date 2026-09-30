# 后继语音适配

用户最终核心目标是角色声线与情绪，成熟 TTS 优先。当前系统声只作备用，不把 rate/pitch 当情感 TTS。

`/api/status` 的 `speechBackends` 声明 reference/emotion/stream/cancel/pcm 能力；不支持的参数明确报错。下一阶段概念接口（尚未完整实现）：

```text
synthesize({ text, voiceId, referenceId, emotion, stream, signal })
  -> WAV / PCM, or cancellable PCM chunks
```

referenceId 对应用户确认许可的本地素材，不接受任意文件路径。身份参考与情绪参考按成熟后端区分。情绪使用后端原生参考/向量/指令，不是网页变声；流式和取消在实际验证后才标支持。单队列、batch 1、短句先测首音/全句延迟、RAM/VRAM 峰值、同句不同情绪和声线漂移。

父任务专项研究待后继验证：IndexTTS-2.5 支持身份与独立情绪，模型卡估计约 6 GB VRAM，未验证本机。Bilibili custom 许可需先核对用途/接受门槛，不能当 MIT 或自动接受新协议。[官方模型卡](https://huggingface.co/IndexTeam/IndexTTS-2.5)、[官方代码](https://github.com/index-tts/index-tts)。

Windows 后备 GPT-SoVITS v2ProPlus：调查参考语音情感路径，[官方代码](https://github.com/RVC-Boss/GPT-SoVITS)、[官方权重](https://huggingface.co/lj1995/GPT-SoVITS)。本阶段没有下载、部署或试听这些候选，不能宣称它们本机可用。

本机 8 GiB RTX 4060 Laptop / 约 16 GiB RAM，曾测 free 3.7 GiB；一次一个候选，避免多权重并存。缺合法明确的角色参考录音，不凭粉丝 checkpoint 猜授权。先合法测试录音 zero-shot baseline，再考虑训练。声音部署不应等 API key。
