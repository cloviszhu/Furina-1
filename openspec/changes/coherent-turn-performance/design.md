## Context
既有模型完整 JSON 回复、abort/generation guard、显式 DeepSeek 发送、20 秒模型期限、128 输出 token 预算和 SQLite 事件底座保留。D_sakiko 仅借鉴编排思路，不搬用代码；其本地模型也 stream=False。

## Goals / Non-Goals
实现一次生成、有界段交付、跨生成/合成取消和明确失败。不引入 SSE，不调整默认自动调用，不部署；编排完成不意味着产品完成。

## Decisions
详见 docs/turn-segment-contract.md。客户端 UUID 保留 HTTP 取消先到的 tombstone；进程内最多128条/30分钟过期。取消后真实收费请求 settle 前继续互斥。安全验证全部完成才分段，一段不超过300且不拆 surrogate pair。第一句独立，后段合并限制请求次数。TTS 失败不写伪造模型回复。

## Risks / Trade-offs
完整模型等待未缩短；首句长度决定第一段 TTS 成本。进程重启后旧段不能重播，需新轮。成功文本已交付时取消演出保留有效历史，不能拿播放完成当记忆形成触发器。自然记忆模块另线实现，需在成功 commit 后捕获和 prompt 前检索，并统一纠错失效。

## Migration Plan
无 turnId 的旧接口兼容。前端分支逐步启用 turnId/segmentId 和统一取消路径，独立端口、临时 DB、fixture 音频验证后父线程安排部署。

## Open Questions

## Sourced nod and restricted greeting gate

nod只使用官方Overte headnod的Spine2/Neck/Head源世界旋转，source/target肩轴与头颈轴建立参考基，world delta共轭转换后结合真实PMX父级/grant生成局部偏移。0.18秒准备和0.4秒收势放入既有2秒生命周期；保留旋转速率上限、取消及重入guards、原世界视线/表情/口型。运行时没有FBX请求或额外引擎，约10.5KB采样附Apache2版权/许可/修改说明，留本机ignored、不随代码分发。只读同源可选character-assets JSON，32KiB/2秒/形状验证，缺失或坏数据回退旧nod，未改server。既有nod回归阈值从旧正弦动作经验值改为已存在的2rad/s局部速率合同，配合双PMX前后截图与取消重启检查，不以角度范围当自然度验收。

音街ウナ官方VMD包已安全只读核实。readme允许换模型必要修改，但另有使用前同意全部条款要求；按此次明确任务边界停在此确认，资源留ignored，本次不演出/改造/分发。元数据206骨轨仅102在两PMX匹配，原动作310帧，不能据骨名匹配直接宣布可用；授权继续后先完整序列定位走动root与wave窗口，再决定合法裁取/脚底适配。nod不受该候选协议阻断。

## Resting motion adapter

仅idle复用Quaternius CC0 Standard的Idle_Loop与A_TPose参考，源rig数据小型离线采样后分发，目标PMX适配只在加载时计算。实际PMX手臂为A-pose，按上臂→肘、肘→腕及掌轴补参考轴，不能只rename轨道或用世界四元数差。source/target腿长换算髋部位移，几何两段腿链固定脚踝世界位置与脚底朝向，避免膝过伸及CCD残差。

用已有Three AnimationMixer在私有骨架代理播放，隔离stage每帧reset与mixer常量值缓存；真实骨架只取混合目标，通过既有旋转速率限制settle。源层上限0.65，保持原头部世界视线、口型、眨眼、表情及手臂动作；mode不是idle、active gesture或显式idleVariant时渐出，取消后渐入。自动idle启用源层时不再跑固定三个10秒姿态槽。无Ammo/physics、额外引擎、后台对话或新服务。

greet/nod没有本包可用clip，保留原实现，不声称改善其来源。双模型60秒idle及15秒idle→greet→cancel→idle可视序列加取消回归用于工程门槛；真实自然度/性格/活人感仍待集中体验，任务2.3/2.4不因此全部勾选。许可与限制见docs/motion-idle-license.md及动作交接。
真实角色与声线自然度仍需完整产品阶段的集中人工验收；多 idle/协调招呼与自动长期记忆筛选效果不能由离线测试替代。
