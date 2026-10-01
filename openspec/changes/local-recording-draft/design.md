## Context
main 3842fcfc。已有 whisper.cpp v1.8.4 多语言 base 及 FFmpeg；不下载新资源。语音/转写只留在短生命周期内存与随机临时目录。

## Goals / Non-Goals
用户主动开始、停止、编辑、发送。排除常听、打断监听、真实模型调用及生产部署。

## Decisions
导出 createAsrHandler，固定 GET status、POST transcription/:UUID 和 POST cancel。handler 返回 handled boolean。二进制 WAV/WebM/Ogg/MP4 magic 与 MIME 匹配；8MiB 输入、30秒录音、30秒处理墙钟、单任务，无排队。FFmpeg 转 PCM16 mono16k 并以 31秒探测拒绝超长，Whisper 固定 no-gpu/threads2/zh。仅随机临时自有目录，close 后清理；断连及显式取消 abort 当前子进程。迟到取消 tombstone 最多128条/60秒。
前端 permission promise generation guard、草稿 revision/value guard。停止 tracks 后转写；取消/模式/页面销毁废弃所有迟到结果。开始停现有角色播放，录音期间拦截发送和播放。

## Risks / Trade-offs
base 真实用户中文准确率未知；草稿须人工校对。隔离 browser fake media 不验证真实设备。运行时缺失明确不可用，无云回退。

## Migration Plan
集成 owner 注册 handler 并进行整合验证；用户集中验收和部署另行安排。

## Open Questions
无阻断实现的问题；真人质量留待集中验收。
