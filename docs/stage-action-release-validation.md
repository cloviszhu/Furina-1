# 动作取消与回位验证

2026-09-30。基于已提交 main `619d028`，独立分支 `motion/smooth-action-release`；worktree：`C:/Users/zhu06/AppData/Local/Temp/exo-motion-worktree`。只修改 `src/stage.js` 与动作专属测试/本文档。

## Evidence / Scope

复核上一轮真实 PMX 轨迹：自然招手收尾、重复动作拒绝、点头和停止说话后的恢复已可用，无需重做。明确缺口是直接中途清除 `action` 时，既有指数插值仍可能在首个 60Hz 帧旋转肘部约 0.37446 rad（21.45°），使抬手快速掉回身体旁。

新对照以 `619d028` 为基线，对两种原始模型执行 0.2 / 0.8 / 1.4 / 2.3 / 3.1 秒取消，并分别测试正常回位及取消 0.2 秒后再次触发招手。旧实现最大肘角步进 0.37792 rad，手腕世界位置步进 0.90582 模型单位。问题是插值缺少角速度边界，不需要改模型、物理或 main。

## Requirements / Design

- 姿态过渡 SHALL 在中途取消、动作完成或重新触发时限制每帧角位移，不改变动作抢占拒绝。
- 小幅 idle、表情、口型、形态、grant 与脚部接地 MUST 保留。
- 本批 MUST 不改主页面、音频、服务器、预算、设置或凭据。

新增 `settlePoseOffset` 将原指数 slerp 步长与角速度上限取较小值：肩以外的腕/肘/手腕控制为 4.5 rad/s，其余骨骼为 2 rad/s。既有 tick 的 dt 上限仍为 0.05 秒；60Hz 肘腕上限为 0.075 rad（4.30°）。小幅目标变化仍使用原指数插值，不引入随机性或时间累计漂移。

新增幂等 `cancelAction()`，只清除动作状态，姿态由下一帧有界过渡回当前 idle 目标。直接赋值 `action=null` 也受同一插值约束，因此不依赖 main 接入新 API。取消之后允许再次触发；正在播放的动作仍拒绝 greet/nod 重复抢占。

停止说话经已有 mouth=0 / mode=idle 路径恢复，原行为已足够。本批只让它使用同一通用边界，没有增加按钮行为或取消本来应自然完成的点头。切换模型仍按原实现清空平滑缓存，未加入跨形态混合。

## Tasks / Results

- [x] 从 `619d028` 创建独立分支，无主工作目录改动。
- [x] 核对 stage、main 的只读调用路径与既有动作证据。
- [x] 完成小范围角速度限制与取消 API。
- [x] 单元测试 5/5：新增取消回位测试覆盖 30/60/120Hz、单步上限、单调逼近、两秒收敛、零 dt、小幅 idle 原插值、取消幂等与重复拒绝；既有松弛动作测试保留。
- [x] 两种 PMX 的隔离 Edge 对照通过：180 秒模拟 idle、连续招手、点头、清除动作、不同取消时点、回位中重新触发、停止说话、表情/口型、形态切换。
- [x] Build 与 `git diff --check` 通过；build 仅提示已有大 bundle。

两种模型的数值结果一致：

| 指标 | 619d028 基线 | 本批 |
|---|---:|---:|
| 五个取消时点及重新触发场景最大肘角步进 | 0.37792 | 0.07500 rad |
| 同组场景最大手腕世界位置步进 | 0.90582 | 0.30577 模型单位 |
| 自然连续招手最大手腕步进 | 0.24716 | 0.23454 模型单位 |
| 停止说话时最大肘角步进 | 0.02179 | 0.02179 rad |
| 五秒后相对即时 idle 目标的最大肘角误差 | 0.00289 | 0.00289 rad |
| mouth=0.5 时 `あ` | 0.30000 | 0.30000 |
| happy 一秒后 `にこり` | 0.27931 | 0.27931 |

所有取消/再次触发场景最终 action=null，重复点头抢占均被拒绝。180 秒双脚世界坐标不变，骨骼数据有限，无浏览器 pageerror。正面对照：取消后 0.1 秒，旧版手掌已快速落到腰线附近，新版仍在前臂下降途中；0.7 秒后接近身体旁，1.5 秒恢复休息站姿。两形态均检查截图，未发现明显新增衣装穿模。

## Reproduction / Evidence

```powershell
$env:EXO_MOTION_ASSETS='C:/Users/zhu06/Documents/ChatGPT/Project Exo/assets/characters/furina/source/mmd'
$env:EXO_MOTION_BASELINE='619d028'
$env:EXO_MOTION_OUTPUT='artifacts/action-release'
node tests/motion-stage-review.mjs
node --test tests/stage-action-release.test.js tests/stage-softening.test.js
node node_modules/vite/bin/vite.js build
```

证据仅本地保留于忽略目录 `artifacts/action-release/`：`evidence.json`、两形态前后 idle/侧面/招手截图，以及 `before/after-{pneuma,ousia}-cancel-{0,6,18,42,90}.png`（60Hz 帧号）。取消截图直接清除 action；数值场景还验证新 cancelAction API。

测试使用 `listen(0)` 随机临时 loopback 端口、新 Edge 会话，静态舞台页面只读引用原模型，不启动应用服务器或数据存储。没有 API、凭据、TTS 调用，不获取资产/软件，不接触用户页面或 3000/9880。大段数值采样跳过 GPU render，截图使用实际渲染；因此不是实测显示 FPS 或长时间 GPU 验证。截图未进行逐三角形碰撞分析。

## Handoff / Limitations

本批解决中途回位的角速度峰值，尚未实现速度/加速度连续的专用重定向曲线；自然招手抬臂峰速受到小幅限制，原动作时长与结束判定保留。已有停止按钮仍只停止音频，未擅自改变 main；本批不宣称新增 UI 动作取消按钮。只提交独立分支，由父任务统一集成；不推 main 或部署。
