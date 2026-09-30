# Design

## Context
见 proposal.md。报告 7 个空历史回合全部结构合格，11 个带历史回合全部纯文本；历史组装只发送 text。请求无 response_format，解析接受纯文本并回退 neutral。提示将未确认与否定混淆。

## Goals / Non-Goals
**Goals:** 统一当前与历史契约，明确失败，保持证据的不确定性。
**Non-Goals:** 不保证真实模型必然合格；不迁移或重写已有报告，不增加收费重试，不部署。

## Decisions
- assistant 历史序列化为 JSON；保留真实 emotion，旧数据缺失使用 null 并说明仅历史允许未知。禁止为了示例捏造 neutral。
- events 添加可空 emotion 列，仅 model-contract 的真实标签写入；旧数据不回填。remote fixture 历史保留同样字段。
- 仅已核实能力的 DeepSeek 加 JSON 输出模式，不向任意兼容服务猜测参数。DeepSeek 纯文本/空内容/截断/非法字段均为协议失败；其他服务保持显式 plain-text 兼容。
- 协议失败带安全固定 code，聊天返回 502，不写入/朗读演示回复；批次一败停止，无重试，保留数字 usage 以便真实计费估算。
- 人设区分未知/肯定/否定，旧 assistant 说法不能自证，允许用户明确虚构；不机械改写已生成语句。

## Risks / Trade-offs
- JSON 模式仍可能空响应/截断 → 明确失败，128 输出预算保持原上限。
- mock 只能证明组装/协议/错误链 → 人设自然度、真实多轮 JSON 与持久记忆仍需用户后续验证。

## Migration Plan
以后经父任务复审再部署；启动时添加可空列，旧版本查询显式列可兼容，不改已有行和台账。
