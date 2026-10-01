# Overte点头动作 · NOTICE

Copyright (c) 2013-2019, High Fidelity, Inc.
Copyright (c) 2019-2021, Vircadia contributors.
Copyright (c) 2022-2026, Overte e.V.

Licensed under the Apache License, Version 2.0. 完整许可随分发提供于 [motion-nod-LICENSE.txt](motion-nod-LICENSE.txt)。源仓库 [LICENSE](https://github.com/overte-org/overte/blob/master/LICENSE) 及 `LICENSES/Apache-2.0.txt`；沿 `interface/resources/avatar/animations` 各层目录未发现另附LICENSE/NOTICE。Hanami资产专属NOTICE明确该点头派生来自同一Overte FBX且为Apache-2.0，仅作来源交叉核实；没有下载或运行Hanami代码/VRMA。

## Source and modifications

官方单文件：[emote_agree_headnod.fbx](https://github.com/overte-org/overte/blob/master/interface/resources/avatar/animations/emote_agree_headnod.fbx)，核实2026-10-01，498,992 bytes，Git blob `dbb46c1c5f8670c67d4a1a4f3f713f2b93fed419`，SHA256 `AACD3D6EAB3986FF2BA0BE332BF379DFB5D7C13C2293E8403BBB53B76AAF4C39`。

[官方avatar-animation.json](https://github.com/overte-org/overte/blob/master/interface/resources/avatar/avatar-animation.json) 的 `positiveHeadNod` 指定帧1–55、timeScale=1、loopFlag=false。动画源55骨，Take001约1.833333秒；BaseLayer有258个动画连接，另一个tpose层仅连接动画栈，没有动画曲线节点。

Project Exo的修改：只从BaseLayer采样帧1–55的Spine2/Neck/Head世界旋转，连同源参考姿态/朝向点，30Hz、55样本、54/30秒，约10.5KB。移除所有源平移/腿/手/脸通道，播放时增加0.18秒准备、0.4秒收势、0.75层权重，放入现有2秒nod生命周期。源采样留在ignored本机 `artifacts/overte-nod/overte-headnod.json`，不进入Git或代码包；后续本机安装时把本NOTICE和完整LICENSE附在资源旁。目标PMX的参考姿态、骨长/方向及局部旋转只在加载时计算、留在内存，未写入资源。

Three0.160.1 FBXLoader遇缺轴的手指旋转曲线时构造空KeyframeTrack并抛错。离线检查对安装的MIT loader做内存诊断替换，仅跳过不能组成旋转轨道的通道；已核所用Spine2/Neck/Head均具有完整56个键。没有修改node_modules或把依赖代码复制到分发文件。运行时无需FBXLoader或下载FBX。原FBX与诊断结果留在ignored artifacts，未随产品分发。

源没有把动作宣布为Public Domain；Apache版权、许可及变更说明随本机派生数据保留。本任务没有分发任何动作资源。没有取用Mixamo/未核许可证资产、作者应用代码或目标PMX资产再分发。
