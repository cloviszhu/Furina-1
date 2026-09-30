# Proposal

## Why
用户报告 18 次请求完成，但只有 7 次 JSON 合格；全部 11 次带历史回合丢失结构。未知经历还被说成确定未发生，需修复协议与认识边界。

## What Changes
- 保留历史真实表达字段，旧历史缺失字段用 null 表示未知，避免纯文本成为输出示例。
- DeepSeek 启用官方 JSON 模式，缺失契约显示失败，不自动重试或演示掩盖。
- 明确未确认不等于未发生、角色旧自述不构成新证据，保持明确虚构创作自由。
- mock 多轮与浏览器错误回归，保护现有报告与台账，不部署。

## Capabilities
### New Capabilities
- `multi-turn-expression-boundary`: 多轮结构契约与记忆认识边界。
### Modified Capabilities
无（项目尚无归档主规范）。

## Impact
providers/persona、聊天历史可空表达字段、测试错误呈现及 mock 回归。现有数据保留；不读取真实凭据、不调用收费模型、不改生产进程。
