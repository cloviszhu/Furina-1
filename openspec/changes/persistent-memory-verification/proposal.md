# Proposal

## Why
18步真实复测已完成且结构合格，但末题仍未验证持久层。需要从用户确认保存、SQLite重开、实际检索到provider请求建立可核验证据，补重复保存防护。

## What Changes
- 独立临时DB/端口/mock端到端回归，不把正确答案塞入provider上下文。
- 验证修改、删除、来源ID、取消、重复保存及聊天时间线隔离。
- 防止UI并发重复提交，同来源同正文保存幂等。
- 明确普通聊天仍为demo，真实单次聊天保存与重开后的真实调用仍待本人执行。

## Capabilities
### New Capabilities
- `persistent-memory-verification`: 持久记忆保存和可核验回归。
### Modified Capabilities
无。已确认记忆现为跨时间线共享；检索隔离范围正等待澄清，不先改变此既有规则。

## Impact
记忆保存、UI和测试，无生产数据迁移、真实API、凭据操作或部署。
