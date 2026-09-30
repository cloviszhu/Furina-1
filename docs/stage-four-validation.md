# 第四阶段验证

2026-09-30，Windows 普通用户，Node24；真实 LLM 调用 0，未读取真实 key。

## 功能与回归

- `npm.cmd test`：52/52，通过且无 skip。有界 WAV 格式/时长/静音/削波、规范化、三份暂存/过期、权利/预览/同 speaker 确认、非法 ID、neutral 起步、忙时/并发拒绝、失败不替换原 registry、HTTP 同源边界、重载持久化、目录 junction 越界读写拒绝。
- `npm.cmd run test:browser`：13/13 Edge，通过且无 skip。新入口用本机合成 sine fixture，没有角色录音：先检查/试听、拒绝未确认、登记 neutral、同 speaker happy、无重启切换和服务重启后恢复。原有两真实 GPT-SoVITS 浏览器 journey、Windows SAPI、PMX、mouth/cancel、跨 tab memory/context、persona 隔离持续通过。
- 新安全回归：三种 provider 的普通/fenced JSON unicode 假 key 被解析后拒绝。浏览器真实 SQLite 与朗读 mock 检查确认 key 未进入回复、events/history 或 speech。不是远程 provider 实测。
- 早期来源回归：十轮后首条消息不在最近16条 API 历史，但仍存在并可保存；检查故障保留草稿，按剧情 context 分区核验。
- build 成功，JS 约745kB / gzip213kB，保留已有 chunk 大小提示；本阶段不大改渲染架构。四个 OpenSpec `validate --all --strict` 通过，格式校验不替代产品验收。

## 真实普通权限生命周期

`node scripts/check-local-lifecycle.mjs` 的本机忽略证据：`artifacts/stage-four/service-lifecycle.json`。

1. 最终严格入口版本的实测从 app70256/TTS80548 开始，重复 start 复用 PID。
2. 停止已核验 app，临时无关 fixture 占3000/PID80380。start 和 stop 均退出1、明确拒绝，fixture 继续响应，TTS80548 不变；fixture 由测试自有 IPC 正常关闭。
3. 只停止已核验 TTS 后重新启动 app74108、TTS venv launcher80632。紧接着重复 start 复用冷启动 PID80632，没有重复 GPU 实例。
4. 干净重启后 app74108、TTS监听64412，服务健康标识/rootId/PID 相符，ready=true，budget usedCalls=0。最后仅重载 app 到64356，使配置重定向防护生效。停止核验包括创建时间和最后一步原生命令再次核对，不按名称批量终止。

默认 PowerShell 禁止 `.ps1` 执行，故入口采用 Node+普通权限原生命令；未调整执行策略。agent 沙箱阻止 CIM/进程管理时，在沙箱外按普通用户执行该验证，不请求管理员，不改防火墙/安全/自启。工具不会自动安装依赖或重新下载权重。

## 视觉与质量边界

`node scripts/capture-stage-four.mjs` → 本机 `artifacts/stage-four/`：真实舞台 desktop/settings/mobile、参考 entry/preview/confirmation/mobile/放弃状态，`visual-evidence.json` 记录 pageerror、overflow、报告和健康状态。已检查桌面和移动端参考入口，无横向溢出与 pageerror；关闭按钮保持可见，预览加载时长，预览/朗读互斥。

预览截图仅用隔离临时数据库中的440Hz tone，展示数据检查和 UI，未登记到主运行数据，未用于 TTS 推理。真实模型截图仅本机保留，不上传云端。质量检查不是人工音质/噪声/声纹/角色相似度验收；同说话人和使用权依赖用户确认。首版接受 PCM16 WAV，其他格式给出离线转换说明。没有角色训练或自然度/持续人格成长声明。

## Git

实现与主体文档提交 **`3dbd071315ece6e9f081becb0812d0aa800d912a`** 已正常 push main，`git ls-remote origin refs/heads/main` 核对一致。之后只有任务完成/交接 checkpoint，最终 hash 见 `git log -1` 与交接结果。不提交 assets/data/artifacts/.runtime/秘密。
