# Design

## Context
完整回复 JSON 接口仍保留。服务端新 turn/segment 合同已按 docs/turn-segment-contract.md 接入，生产 app/TTS 不接触。

## Goals / Non-Goals
目标：turn 单一所有权，短句按序、可取消、与音频同步。暂不支持麦克风 always-listen 或 LLM token streaming。

## Decisions
使用 generation + AbortController 拒绝迟到模型、合成及解码。阶段独立于口型。完整回复本地分句，每句最多100 UTF-16长度，保护代理对；最多预取下一句以限制队列资源。字幕表情和一次应答点头在 source.start/utterance.onstart 才出现。buffer source ended 控制下一句和终态。
舞台保持根和腿不动，用上半身有限变化建立几个持续姿态、观察停顿及招呼的准备/转向/回应/回位；保持取消角速度上限。实际双模型截图与运动序列供视觉检查。

## Risks / Trade-offs
分句合成仍有等待间隙 → 明确显示 preparing，不声称连续模型流式。
程序骨骼动作无 IK/physics → 不搬动根腿，不添加大范围重心或交叉手臂。
严格段落emotion不允许手动覆盖 → 正式交谈按段落表达，未登记时省略emotion并明确neutral；手动声音试听仍保留。产品差异已交接父线程。
mock音频/截图无法证明角色声线和长期自然感 → 单独保留感知验收边界。

## Migration Plan
提交独立分支给集成者合并；不推main、不部署。集成验证后由父线程判断交付。
