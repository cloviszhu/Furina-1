# 第三阶段：集成与用户旅程验证

2026-09-30 UTC，基线 main `14175e2aedfa1f449b531b1b966ee689d30b8f5a`。首先集成独立 QA；集成提交 `fad06848e9664153bb88bbeefa22b7a994975420` 已 push 且 ls-remote 一致。第三阶段实现/交接提交以 handoff 的最终 Git checkpoint 为准。

## 最终检查

| 检查 | 结果 |
| --- | --- |
| `npm.cmd test` | 41/41 pass，0 fail/skip |
| `npm.cmd run test:browser` | 10/10 pass，0 skip；真实 Edge、PMX、GPT-SoVITS 与 Windows SAPI |
| `npm.cmd run build` | 成功，16 modules；JS 740.23 KB / gzip 211.76 KB；Three.js 超 500 KB 提示仍存在 |
| `openspec.cmd validate --all --strict` | 三个阶段通过；格式不代表产品效果 |
| Git | whitespace/索引检查；资产/声音/数据/权重/秘密不提交 |

浏览器使用已安装 Edge、SwiftShader 软件 WebGL、静音。实际 WAV 解码驱动口型，不代表人工听感或硬件渲染性能。模型 provider 都是本地注入替身；部分异常与文本轮次也使用明确替身。

## 旅程证据

- **舞台**：两模型分别 425 骨骼/31,099 顶点和 387 骨骼/29,937 顶点，均 63 morph；招呼实际改变蒙皮顶点，点头可触发。截图显示完整贴图/站姿及基础表情，page errors=[]，390×844 无横向溢出。
- **记忆**：用户消息保存来源；错误地点只描述相关记录。蛋糕→布丁后关闭/重建服务及 SQLite，修订/来源保留；删除不召回旧内容，能继续手动保存。延迟 provider 成功/失败及旧 200 均不显示/朗读/重新持久化。多标签页删除使另一页旧消息、来源及口型清空，广播无正文/密钥。
- **角色/协议**：两时点、三风格，历史按配置隔离，共同经历保留。七种 provider 使用统一 `{text,emotion}` 契约；纯文本 neutral，非法结构回退明确演示。人设解释与来源限制见 [角色契约](character-contract.md)。
- **真实语音**：生成/播放停止、取消后替换、切换表达/语速、下一回复使用新设置、自动模式采用 calm、PMX happy morph 与声音同场；Windows SAPI 真实播放/复位通过。502 替身明确显示没有自动切换系统声；刷新声音也需显式选择备用声。
- **恢复**：拦截 PMX/声音模拟缺资源时仍能聊天，显示 README/TTS 命令；项目请求断开给出 `npm.cmd start`，保留草稿并恢复发送按钮。临时 browser/SQLite 数据逐例隔离清理，生产舞台测试只创建/删除带验收标识的条目；删除按产品语义清空短期聊天。

## 实际服务重启与队列

初始核对应用 PID 68876、TTS PID 75548，仅停止本项目的已核实进程，未泛杀 Node/Python。旧工具 session 不可跨接力访问，按实际端口识别；沙箱 COM/进程限制使用工具执行范围放开，不是 Windows 管理员提权或安全设置更改。

空闲 TTS 停机后 status ready=false 给出完整启动命令，实际合成返回 502“没有自动切换系统声”，仍列本机备用声。用既有环境/权重恢复为 PID 64468，CUDA FP16 v2ProPlus，checkpoint key 全匹配，未下载新权重。

`node scripts/check-real-tts-queue.mjs` 同时发起两个真实请求，观察 active=true/pending=1。neutral 约 8.30 s 完成，排队 happy 约 9.55 s 总完成（第二任务增量约 1.25 s）；不能把排队总时延称 hot latency。PCM16 WAV 317,484/332,844 bytes，结束后队列空闲，预算 0 次/0 元预留。

## 本地截图与原始证据

全部在忽略目录 `artifacts/stage-three/`，含用户角色图像/测试音频，不上传或入 Git：

- `pneuma-{idle,greet}.png`、`ousia-{idle,greet}.png`：两形态/招呼。
- `expression-{happy,sad,angry,surprised,calm}.png`、`portrait-{happy,sad,angry}.png`：手动参考控制后的实际 morph，不是自主情绪证据。
- `settings.png`、`mobile.png`、`visual-evidence.json`：空 key、设置、移动布局、模型统计与错误清单。
- `tts-unavailable.png/json`：真实停机 UI/502；截图当时系统声已标注，后续还增加“显式选择备用声”占位。
- `service-recovery.json`、`restart-neutral.wav`、`restart-happy.wav`：真实队列恢复，未人工试听。

截图重跑：`node scripts/capture-stage-three.mjs`。队列重跑需现有服务 ready，会生成两条本地 WAV，不调用 LLM。

## 安全与费用

Host/Origin/Sec-Fetch-Site 保护读写；编码越界/静态根/排除文件测试通过。聊天超 1,500 字、HTTP body 超 32,000 bytes 拒绝；远程上下文超 16,000 bytes、未知/过期价格或超调用数在 dispatch 前拒绝。不是静默截短聊天；系统备用声最长 1,000 字，本地 TTS 每次 300 字。

模型响应限 128,000 bytes，当前 key 完整回显拒绝，usage 仅非负整数计数。故意假的 fixture key 不进入错误/历史/DB/浏览器持久存储；刷新/切换清空密码框。没有读桌面 secret、`.env`、其他应用凭证或打印供应商错误 body。真实付费模型请求 **0**，只访问 loopback 推理及公开文档。

[DeepSeek 官方人民币页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 2026-09-30 10:15 UTC 复核：高峰/未命中 Flash 输入/输出 2/8、Pro 9/27 元每百万 token。继续 10 倍预留、3 次、128 输出 token、RMB 9 上限、24h 过期拒绝；失败/重启不释放预留，未充值。用户本人输入 key 前不测试真实服务。

## 未测与下一步

真实 LLM、人设一致性/真实情绪选择/持续成长未测。官方视频/动态页未完整提取，角色摘要是可配置项目解释，需游戏任务对照与用户校准。

当前 RAVDESS Actor24 CC BY-NC-SA4.0 非商业测试声 **不是芙宁娜声线**。人工听感、情绪自然度、相似度、身份稳定性未验收；没有训练。没有流式首音、GPU 硬取消、布料物理或精准音素口型。缺合法角色素材前不额外下载/训练，在 16 GB RAM/8 GB VRAM 上不追加大权重。同源广播不覆盖其他浏览器/外部脚本改 DB。
