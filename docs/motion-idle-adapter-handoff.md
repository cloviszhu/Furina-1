# 待机动作适配交接 · 2026-10-01

独立分支 `motion/visual-coordination-review`，从 main `2297fa01827640c8bc56162f76fcae62deae64c4` 开始；研究/fixture 前置提交为 `5fc4e2866bd8ad41bd1e377a6a023c500ac13635`。实现只涉及 stage/motion、自有测试和本 change 文档。未部署，未碰生产服务、TTS、ASR、记忆、用户页面、真实密钥或模型 API。

## 实际发现与改动

1. 原双 PMX 60 秒截图中胸腰基本锁直，脚虽固定，身体仍主要是站直的姿态叠加；自动姿态按固定三个10秒槽轮换。现在仅自动静默 idle 叠加 Quaternius CC0 `Idle_Loop`：较缓的髋部沉降、胸肩及手臂小动作；取消原自动三槽，保留显式姿态、视线和表情。源动作2.5秒以约0.48速度播放，并有小幅速度漂移；仍是循环，不声称行为丰富或自然度完成。
2. 真实 PMX 为 A-pose。仅用世界四元数差重定向会让手臂重复下垂、手落进衣摆；源/目标髋位移若遗漏，脚又离地。现按实际肢段/掌轴补参考方向，按腿长换算髋位移，解析两段腿链固定脚踝位置与朝向。最终正侧面截图双形态未见倒置、明显手/衣摆穿入、膝过伸或脚漂；截图无法排除全部细小碰撞和衣物动态问题。
3. stage 每帧重置真实骨架，AnimationMixer 常量轨道缓存会使动作静态分量丢失，取消后的肘姿态错误曾达约0.397rad。改为私有骨架采样，再通过既有速率限制混合；最终同场景误差降至0.003533rad以内。源层上限0.65，手臂/肘/腕权重分别0.6/0.5/0.35；动作与非idle状态渐出，取消后渐入。

默认启用自动idle源层；`setIdleSourceEnabled(false)` 可在隔离fixture对照，现有turn生命周期与动作guard API未变。缺骨链时保持原动作。头部仍采用原世界视线目标，口型、眨眼、表情不归源clip管理。greet/nod没有合法新clip，保留原实现，因此不宣称其动作来源或抬头体验已改善。

## 可核验结果

隔离环境：单个 Edge/Playwright 实例，SwiftShader 软件 WebGL，900×900 stage-only页面；本地现有425/387骨PMX只读加载，无应用服务、音频、摄像头/麦克风或GPU推理。确定性60Hz推进、10Hz数值采样，截图时才绘制。真实PMX纹理/截图均留在ignored artifacts，未进入提交。

- `node --test tests/motion-idle.test.js tests/stage-action-release.test.js tests/stage-softening.test.js`：10/10通过，含缺骨链回退检查。
- `node tests/motion-idle-regression.mjs`：双形态、前后版本分别180秒idle、greet/nod重入拒绝、10个取消/重启时点、停止说话、模型切换均通过；无pageerror。after最大头旋转步长0.005617rad/帧，手腕移动0.224678模型单位/帧，取消肘步长≤0.075001rad/帧，回到待机误差≤0.003533rad；嘴形0.3与笑形0.279306保留。
- `node tests/motion-visual-sequence.mjs final-adapter --source`：双形态共14场景，60秒idle和15秒idle→greet→cancel→idle，以及独立greet/nod/cancel/speaking/thinking；无pageerror，每形态19轨适配可用。人工查看原/最终idle正面、最终侧面与取消前后序列。
- 最终idle稳定段5–60秒：腰竖向跨度0.067204、胸0.079222模型单位；包含起始缓入的0–60秒胸跨度0.311858，原胸跨度0.002559。真实脚踝及变形D骨世界漂移均小于5e-15模型单位。数字仅定位姿态及脚固定，不是自然度评分。
- `node node_modules/vite/bin/vite.js build --outDir artifacts/cc0-idle-build`通过；仍有既有大chunk提示。
- `openspec validate coherent-turn-performance --strict`通过；任务2.3/2.4未勾选。

本次实测工作树目录：`C:/Users/zhu06/AppData/Local/Temp/exo-motion-visual-review`。
本地证据：`artifacts/motion-visual-review/before-sequence.json`、`final-adapter-sequence.json`及同名前缀PNG；`artifacts/cc0-idle-regression/evidence.json`和前后idle/greet/cancel截图；最终运行stdout/stderr分别在`artifacts/motion-final.*.log`与`artifacts/motion-regression.*.log`。旧失败重定向证据见源研究交接，不能混作最终效果。

## 重放与来源

先设置 `EXO_MOTION_ASSETS` 为现有PMX/纹理目录，再运行上述fixture。fixture随机本地端口，仅暴露src/node_modules及明确资产目录，finally关闭自己创建的browser/server。回归baseline默认`5fc4e28`，缺该提交时用`EXO_MOTION_BASELINE`指定本次main起点。

分发只含约88.6KB的CC0源rig动作采样，不含PMX数据或完整GLB；许可、来源、哈希与离线重建见 [motion-idle-license.md](motion-idle-license.md)。无需下载资产即可运行产品/测试。源bake脚本仅离线重建时需要授权取得的官方GLB。

## 尚未达到的效果与下一步

循环仍可识别，手指、衣物物理、主动目光事件及有语义的全身准备/收势仍有限；说话层仍用原程序动作。本次没有录屏工具，采用新鲜密集截图序列和确定性采样，无法替代实际连续播放节奏及角色相似度感知。没有真人体验rubric、真实模型或声线验证，不报告完成度。

父线程先审查独立提交及同场景证据，再决定合并与部署；本任务未授权部署。后续自然动作应围绕完整角色体验与合法动作来源扩展，不以增加idle数量或角度变化验收活人感。
