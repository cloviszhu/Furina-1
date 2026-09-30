# Design

## Context
父线程已交自然记忆ca990c3给集成owner，前端list/revise/delete合同待提供。既有共同经历tab仍管理手动记忆。

## Goals / Non-Goals
目标：准备完整用户管理状态及呈现，不假设后端字段、URL、修订语义。当前不挂正式页面。

## Decisions
使用内部呈现适配器list({signal})、revise(key,text,{signal})、remove(key,{signal})，仅表示前端回调契约，不是HTTP接口建议。列表由适配器映射为{key,text,evidence:[{label,text}],updatedLabel}；key为opaque值，不假设episode字段。
状态分unconnected/loading/ready/error，编辑草稿和删除确认独立，mutation锁阻止重复提交。只有确认的编辑/删除调用onBeforeMutation停止旧对话；成功后onMutation触发跨页失效通知与相关列表刷新。读取generation拒绝旧snapshot，dispose中止读取与修改。
全部记忆文本以textContent呈现，不执行用户记忆中的HTML。

## Risks / Trade-offs
后台修订的revision与source lineage未知 → 等服务端合同后由adapter映射，防止失效纠正重新引入旧来源。
列表刷新失败 → 保留当前记录与草稿，错误可见；变更成功后的刷新失败不能误称变更失败。
无接口接线 → 模块仅独立测试，不将此增量宣称完成自动记忆功能。

## Migration Plan
独立提交供父线程集成。合同到达后接到共同经历tab，与手动记忆明确区分，验证实际列表/纠正/删除影响检索与跨页取消。
