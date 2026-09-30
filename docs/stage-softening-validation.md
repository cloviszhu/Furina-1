# 芙宁娜动作小幅松弛验证

2026-09-30。基线为已提交 `8358e4f`，独立分支 `motion/soften-stage-idle`，worktree 位于 `C:/Users/zhu06/AppData/Local/Temp/exo-motion-worktree`。仅修改舞台与动作专属测试/文档；未改变声音、设置、凭据、服务端、预算、主页面或原始资产。

## Why / Evidence

现有 PMX grant 已生效，不是骨骼未带动网格。两种形态分别为 425 / 387 骨骼；上身经腰、上半身、上半身3、上半身2传递，肩臂有辅助/捩骨。180 秒 idle 的实际骨骼采样显示，左右肘与手腕局部旋转几乎完全固定（四元数差约 0 / 浮点误差），只有肩胸带着手臂动。基线正面截图中左手基本藏于衣装之后，双臂容易显得固定。

## Requirements / Design

- 舞台 SHALL 在保留既有手势时序、grant、重复动作拒绝及形态切换清理的前提下增加小幅次级运动。
- 舞台 SHALL 保留表情与音频口型通道，使用确定性曲线，难过/平静/倾听时降低新增运动。
- 舞台 MUST 保持根部与脚部不动，不添加未经验证的骨盆移动：当前不解算腿部 IK。

`softenStageFrame` 在现有 `motionFrame` 之后补充控制骨角度，再沿用既有四元数平滑与 grant。左臂向前及外侧小幅展开（X -0.04、Z +0.055 rad）；上身呼吸与侧倾有反向胸颈补偿；双肘腕按呼吸错相变化。新增动态角度向量不超过 0.026 rad。招手峰值时，新增右肘腕运动完全让出控制，收尾按同一五次缓动包络恢复。左臂静态偏移约 0.068 rad，不新增腿部控制。

## Tasks / Validation

- [x] 建立独立 worktree，从已提交 HEAD 工作。
- [x] 读取 `.agents/skills` 的 OpenSpec 指南及既有动作/资产/验证文档；按本任务授权采用这一紧凑的需求、设计、任务、验证记录，未改其他进行中的 OpenSpec change。
- [x] 隔离 Edge 对照两种真实 PMX，检查正面、侧面 idle 和招手截图。
- [x] 两种形态分别以确定性 60Hz 时钟采样 180 秒 idle、两次连续招手、点头、拒绝抢占、清除动作后恢复、倾听/说话/idle、表情口型、形态切换。
- [x] `node --test tests/stage-softening.test.js`：2/2 通过；覆盖六种表情、180 秒角度边界、面部通道不变、招手峰值让出控制及曲线连续性。
- [x] `node node_modules/vite/bin/vite.js build` 通过；仅既有大 bundle 提示。
- [x] `git diff --check` 通过。

## Results

两种模型得到相同的控制轨迹数值，说明差异来自控制姿态而非模型形态替换。

| 指标 | 基线 | 改进 |
|---|---:|---:|
| 左肘 idle 最大角度范围 | 约 0 | 0.04954 rad（2.84°） |
| 右肘 idle 最大角度范围 | 0 | 0.04918 rad（2.82°） |
| 左腕 idle 最大角度范围 | 0 | 0.04159 rad（2.38°） |
| 右腕 idle 最大角度范围 | 0 | 0.04221 rad（2.42°） |
| 连续招手最大手腕世界位置步进 | 0.24735 | 0.24716 模型单位 |
| 点头最大头部角步进 | 0.002720 | 0.002720 rad |
| 强制清除招手后最大肘角步进 | 0.37440 | 0.37446 rad |
| 嘴型 `あ`（输入 mouth=0.5） | 0.30000 | 0.30000 |
| 微笑 `にこり`（happy 1 秒） | 0.27931 | 0.27931 |

180 秒 idle 双脚世界坐标保持不变，骨骼数据全部有限，浏览器无 pageerror。重复招手/点头抢占被拒绝；连续动作完成后 action=null；强制取消后两秒恢复；说话停止后回 idle；形态切换清除动作与平滑缓存。正面截图中左手由衣装后方移至身体侧前方，改动轻微，招手姿态保留。

## Reproduction / Local evidence

不启动项目应用服务。测试本身使用 `listen(0)` 随机临时 loopback 端口、新 Edge 进程与全新浏览器上下文；静态路由仅开放舞台源码、依赖和显式指定的既有模型目录。没有数据库、凭据工具、TTS 或 API 调用。模型只读从原目录 HTTP 提供，没有复制/移动资产或上传截图。

```powershell
$env:EXO_MOTION_ASSETS='C:/Users/zhu06/Documents/ChatGPT/Project Exo/assets/characters/furina/source/mmd'
node tests/motion-stage-review.mjs
node --test tests/stage-softening.test.js
```

本地忽略目录 `artifacts/stage-softening/` 保存 `evidence.json` 与 `before/after-{pneuma,ousia}-{idle,idle-side,greet}.png`。基线源由 `git show 8358e4f:src/stage.js` 只读获取。测试等待贴图网络请求结束才截图。数值采样期间跳过 GPU render，只执行实际舞台 tick、骨骼、grant、矩阵更新；最后恢复 render 生成真实截图。

## Limitations / Handoff

这是小幅程序化改进，不代表用户已满意，也不等同真人动作捕捉。180 秒为加速模拟时钟，不能证明真实显示 FPS 或数小时 GPU 稳定性。截图与骨骼轨迹不是逐三角形碰撞检测；所检查视角未见明显新增穿模，但衣装/手套遮挡仍受原始 rig 限制。强制取消沿用既有平滑回位，第一帧肘角约 0.374 rad，未声称已重新设计取消过渡。无腿部重心转移或头发裙摆物理；现有目光/眨眼节奏保持原样。

没有刷新用户页面，没有重启 3000/9880，没有 push 或部署。父任务审阅本分支提交后自行安排合并与服务协调。
