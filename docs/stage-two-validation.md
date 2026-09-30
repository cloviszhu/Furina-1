# 第二阶段实测：本地成熟 TTS

2026-09-30，GPT-SoVITS v2ProPlus 单方案在真实 Windows/RTX 4060 Laptop 跑通。对话仍为规则演示；远程收费 API 调用 0，未读密钥文件、未训练。

## 可运行验收

| 项目 | 结果 |
| --- | --- |
| 环境 | portable Python 3.11.16、torch/torchaudio 2.7.1+cu126；CUDA FP16 tensor 运算成功；锁定环境 pip check 118 包兼容 |
| 模型 | 官方 s1v3/v2ProPlus/BERT/HuBERT 与 speaker encoder；源码固定 `48b1a0169a28582a8984402f82cf438d3bfa6aca`；加载权重 key 全匹配 |
| 核心适配 | 参考/许可登记、路径边界、独立表达字段、禁止朗读标签、数字 loopback/禁止重定向、完整 PCM16 检查 |
| 生命周期 | 单 GPU 槽、3 个等待任务；生成中断线取消投递；旧任务结束后下一句运行；120 秒超时隔离，不自动重试/切换备用声 |
| 测试 | 18/18 Node；3/3 实际 Edge 浏览器、无跳过；真实成熟 WAV/振幅口型/停止/生成中取消+替换、真实 SAPI、两份 PMX/移动布局 |
| 构建/规格 | Vite build、两个变更 OpenSpec strict；JS 约 736 KB / gzip 210 KB，体积提示仍在 |
| 隐私 | 原始/生成音频、权重/缓存、截图、data 全部忽略；本轮音频未公开上传 |

浏览器静音，真实波形确实解码和驱动口型；这**不等于人工试听认可音质或自然情绪**。协议替身回归和真实生成分别记录。

## 六表达同句基线

来源为 [RAVDESS，Livingstone & Russo (2018)](https://zenodo.org/records/1188976)，CC BY-NC-SA 4.0。Actor 24，六种 normal-intensity 表达，逐字稿同为 “Kids are talking by the door.”。合成文本固定“终于见到你了。这一幕，就让我们一起写下去吧。”，英文 reference → 中文，seed 42、batch 1、FP16、无流式。

| 参考表达 | 首字节/全量返回秒 | 音频秒 | RMS | 生成声线相对生成 neutral 的 cosine |
| --- | ---: | ---: | ---: | ---: |
| neutral（本次进程冷） | 9.272 | 4.64 | 0.00753 | 1.000 |
| calm | 1.354 | 5.36 | 0.00815 | 0.958 |
| happy | 1.109 | 4.76 | 0.01151 | 0.953 |
| sad | 1.303 | 6.04 | 0.01202 | 0.921 |
| angry | 1.114 | 5.60 | 0.01495 | 0.857 |
| surprised | 1.117 | 4.68 | 0.01117 | 0.886 |

32 kHz/PCM16，全量返回后可播放，首字节约等于生成完成，未验证流式首音。六段波形全部不同、削波比例 0；振幅整体偏低，是否响度/噪声/自然度合适需要人工试听。

声线诊断复用已下载官方 ERes2Net，在 CPU 上计算；相对各自原始 reference 的 cosine 为 0.663–0.847，相对 neutral reference 为 0.739–0.840。YIN 中位音高约 232–271 Hz。跨语言和情绪影响这些指标，**未校准阈值，不能解释为准确率、身份保证或芙宁娜相似度**。angry/surprised 漂移较大，后续需重点试听；目前没有证明参考切换能完全保持身份。

采样（约 0.5 秒加 nvidia-smi 时间，可能遗漏瞬时峰值）：TTS 进程 RSS 峰值 4811.7 MiB，整机 GPU 使用峰值 4849 MiB，最低可用 RAM 1498.2 MiB。热样本 RSS 约 3459–3679 MiB，整机 GPU 4542–4614 MiB。仅短句基线，不宣称长对话/训练有同样资源表现。未关闭用户程序。

本地证据：`artifacts/tts/baseline-6.json`、六段 WAV、`acoustic-diagnostics.json`。复跑：确认本项目 TTS PID，再执行 `measure-local-tts.py --pid <PID> --count 6` 与 `inspect-tts-baseline.py`。前者低于 500 MiB 可用 RAM 或 GPU 总使用超过 7700 MiB 仅终止已验证身份的项目 TTS；后者需 2 GiB 空余 RAM。

## 安装来源、体积与遇到的问题

- uv 官方 0.12.21 Windows zip 17,992,232 字节，SHA256 与官方校验文件一致；Python 下载约 24 MiB。
- PyTorch 官方 CUDA wheel 约 2.5 GiB；模型子集共 1,892,104,076 字节，LFS 文件按官方 SHA256 校验；G2PW 包按官方指定 revision 获取。RAVDESS 官方 zip 208.5 MB、MD5 `bc696df654c87fed845eb13823edef8a`，仅提取六个 WAV。
- 安装目录逻辑文件体积约 15.77 GB，其中 venv 6.16 GB、uv cache 6.46 GB、源码/模型 2.70 GB；uv 链接/缓存可能重复统计，不能当作物理占用或下载量。C: 观察到减少约 9.81 GB，其他程序也可能影响该差值。
- `jieba_fast` C++ build 失败 → 纯 Python jieba 兼容层，官方源码不改，无管理员工具链。
- 新 NLTK 英文 tagger 缺失 → 官方词典数据显式准备到 `.runtime/nltk-data`；初次上游自动下载曾落在 AppData，保留，不误删可能共享的数据。
- 最新 ONNXRuntime 1.30.0 需要 CUDA13 → 固定 1.22.0，与 PyTorch CUDA12 DLL 兼容；失败期间曾回退 CPU 并生成首个 WAV（7.571 秒），该结果不混入最终六表达 GPU 基线。
- IndexTTS 自定义协议下载即接受，未接受、未下载。没有为了相似度找粉丝 checkpoint 或受限游戏音频。

## 未达成与下一步

成熟核心部署/适配器已完成，最终角色声音没有完成：无角色授权 reference、无人工音质/情绪/身份试听结论、无流式音频、无 GPU 硬中断。先让用户试听合法 baseline 并提供/确认角色素材使用范围，再决定零样本是否足够或需微调。资源测试不足以支持现在直接训练。

此前三个记忆 bug 仍见 [独立 review 待修](stage-one-review-pending.md)，由父任务协调隔离 QA；TTS 验收不证明那些问题已修复。
