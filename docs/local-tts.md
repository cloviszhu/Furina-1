# 本地成熟 TTS 运行指南

第二阶段选用 **GPT-SoVITS v2ProPlus**，自写适配器与部署包装；没有复制参考角色项目代码。仅本机、无需账号、无需管理员或收费调用。默认对话仍是规则演示。

## 当前本机

项目 http://127.0.0.1:3000；TTS http://127.0.0.1:9880。设置 → 声音与表达 → `女声 · RAVDESS 24 非商业测试（非芙宁娜）`。支持原表达、平静、开心、难过、生气、惊讶及 0.7–1.3 语速。只能选择已有 reference 的表达，字段不会插入正文。

这些是许可明确的测试声线，**没有芙宁娜相似度验收，也没有人工音质/情绪自然度验收**。Windows/浏览器系统声仍为显式的临时备用，成熟后端失败不会静默替换声音。

## 隔离安装与启动

Node 24、Git 与约 10 GiB 磁盘余量；本机约 16 GiB RAM、8 GiB NVIDIA GPU。程序/源码/权重/缓存位于忽略目录 `.runtime/`。安装器采用 portable Python 3.11.16、PyTorch/torchaudio 2.7.1 CUDA126、ONNXRuntime 1.22.0 与锁定推理依赖；不改系统 PATH、执行策略，不装管理员 Toolkit、DeepSpeed 或编译 kernels。

```powershell
node scripts/setup-local-tts.mjs
# 已安装后的只读检查，不重复下载模型：
node scripts/setup-local-tts.mjs --verify
# 仅本地非商业表达测试，可选；不覆盖用户的现有声音登记：
.runtime/tts-venv/Scripts/python.exe scripts/prepare-tts-test-references.py
# 启动后端，等看到 9880 服务成功：
.runtime/tts-venv/Scripts/python.exe scripts/run-local-tts.py
```

另开终端按 README build/start 项目。Python 解释器使用完整相对路径，无需 activate。停止项目自有终端中的服务即可；不能泛杀 Python/Node。安装器固定官方源码 `48b1a0169a28582a8984402f82cf438d3bfa6aca`，发现已有源码版本不符会停止，不自动覆盖。

Windows `jieba_fast` 需要 C++ 工具链，本部署以 `jieba` 同 API 兼容层取代分词加速；官方 TTS 源码未修改。第一次推理曾自动下载 NLTK 词典到用户 AppData；后续已通过 `prepare-tts-nltk.py` 明确准备到 `.runtime/nltk-data`。没有清理可能被其他程序使用的 AppData 文件。核心环境与后续资源独立于全局 Python。

## 使用自己的许可参考

将允许用于本地声音合成的 PCM16 WAV 放入 `data/tts-references/`，时长 3–10 秒，干净、单人、无背景音乐。不要把来源可下载当作授权。修改本地 `data/tts-config.json` 后重启项目服务；配置和音频均不入 Git。

```json
{
  "endpoint": "http://127.0.0.1:9880",
  "profiles": [{
    "id": "my-approved-voice",
    "label": "我已获授权的参考声线",
    "source": "填写真实来源与许可依据",
    "license": "填写实际允许的使用范围",
    "usageAllowed": true,
    "references": {
      "neutral": { "file": "neutral.wav", "language": "zh", "text": "参考录音准确逐字稿。" },
      "happy": { "file": "happy.wav", "language": "zh", "text": "同一人开心表达的准确逐字稿。" }
    }
  }]
}
```

登记只表示使用者确认有权使用，程序不能验证著作权或人格权授权。路径必须留在登记目录，网页只能发 reference ID；缺少某种表达会拒绝。当前合成正文为中文，最多 300 字；参考 language 支持上游 zh/en/ja/ko/yue，实测本轮为英文参考→中文输出。

## 边界与取消

Node 单任务串行、最多 3 个等待任务，WAV 上限 16 MiB/60 秒，120 秒生成超时后隔离队列，需重启本地 TTS 和项目服务。后端根地址只接受数字 loopback HTTP，不跟随重定向。包装后的上游仅开放 `/openapi.json` 与 JSON POST `/tts`；控制、权重切换及 GET 合成接口均拒绝，Host/Origin/跨站请求校验生效。

“停止”立即停止播放、复位口型、取消投递并丢弃迟到结果；上游 GPU 工作不做硬中断，必须等它释放后才运行下一句。第一版返回完整 WAV，**尚未接入流式首音**。不可将官方支持 streaming 当作本项目已实现。

## 官方来源与许可

- [GPT-SoVITS 源码](https://github.com/RVC-Boss/GPT-SoVITS)：MIT，原始 LICENSE 保留在依赖目录。
- [官方权重](https://huggingface.co/lj1995/GPT-SoVITS)：模型卡 MIT，revision `336b2ec4e8d4ac74740798dd40af44e74659ecaf`。仅 s1v3、v2ProPlus 生成器、speaker encoder、BERT/HuBERT；无训练 discriminator/ASR/UVR 权重。
- [官方指定 G2PW 下载](https://huggingface.co/XXXXRT/GPT-SoVITS-Pretrained)：revision `0c47645e02a7bc3688d7b263b0042c81e3cd82cd`；[原始 g2pW 项目](https://github.com/GitYCC/g2pW) Apache 2.0。模型清单与校验记录在 `.runtime/model-manifest.json`。
- [RAVDESS，Livingstone & Russo (2018)](https://zenodo.org/records/1188976)：CC BY-NC-SA 4.0。本机只取 Actor 24 六个同句表演，非商业私人测试，不上传原始或生成音频；商业用途另需许可。
- [LibriSpeech，Panayotov 等](https://www.openslr.org/12)：CC BY 4.0。[PyTorch 官方教程样本](https://docs.pytorch.org/audio/2.8.0/tutorials/asr_inference_with_ctc_decoder_tutorial.html) 已下载并转换为 PCM16，未用于最终六表达基线。
- [ONNX/PyTorch CUDA 兼容说明](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)：共享同 CUDA/cuDNN 主版本的 wheel DLL，无需独立管理员安装。
- [IndexTTS 自定义协议](https://huggingface.co/IndexTeam/IndexTTS-2.5/raw/main/LICENSE)：下载即视为接受；用户尚未明确接受，本阶段未下载/使用 Index。

没有训练。当前 baseline 足以证明部署可用；缺少角色授权素材和人工对比，使训练需求仍不能判断。下一步先试听零样本输出、收集允许的同角色同语言参考，再判断是否值得少量微调。
