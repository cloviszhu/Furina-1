# 招呼源核实与点头适配交接 · 2026-10-01

独立worktree `C:/Users/zhu06/AppData/Local/Temp/exo-una-greet-review`，分支 `motion/una-greet-review`，基于main `f8ca400`（上一待机适配已由父发布）。只改stage/motion、自有tests/docs及现有coherent-turn-performance规格；任务2.3/2.4不勾选。未部署、未推送、未改生产/TTS/ASR/server/providers/memory；没有凭据、付费API、录音、麦克风或用户页面操作。

## 招呼：真实官方包已核，协议确认阻断演出

[音街ウナ官方动作页](https://otomachiuna.jp/download/download-detail4/) 的「可愛く歩いてきて手を振る」直链 `https://otomachiuna.jp/wp-content/uploads/2024/07/Walk_cutely_and_wave.zip`。HEAD与实际ZIP均27,302 bytes，SHA256 `9C7E3F4DE4DA4FBFA9A36DAC42FD0DE6DC44A1FDCA08E4893045CFB141B0A83C`。只含Readme.txt 2,284bytes（UTF-8）和VMD 144,170bytes；归档路径均解析到自有ignored目录内，无可执行文件/路径穿越/大项，没有登录、验证码、年龄gate、付款或额外网页确认。磁盘空余约334GB；未下模型/权重。

[官方总条款](https://otomachiuna.jp/download/) 允许FREE素材商业使用、个人范围使用，禁止素材再分发，要求核Readme。包内Readme明确说明其他模型可作必要修改，并允许修改后的再分发但须保留名称与Readme；与官网总条款的再分发限制有范围差异，本任务按更保守的本机ignored不分发处理，不能把“禁止公开再分发”理解为禁止私人使用。

然而Readme开头另要求使用前阅读并同意全部条款，不理解或不同意就不得使用。用户本次明确要求遇新协议确认停报，因此已提出一次具体条款确认，暂未获答复；此后只读元数据，不演出、剪裁、修脚底或混合这个VMD。模型替换所需修改有明确许可，裁wave/去root虽属于修改但未被单独点名；得到条款同意后仍先看完整演出再决定必要适配，不凭许可推导实际效果。

只读元数据：VMD0002/right-handed，1259骨键、189morph键、无camera，206骨轨，最大310帧（约10.333秒）。两个现有PMX分别425/387骨，均匹配102骨轨、缺104；缺失包含乌娜帽/发/裙辅助等，也有须检查的控制辅助。MMD骨名覆盖不能证明动作兼容；尚无视觉证据，不能说完整走来/挥手适合站在现舞台，更不能直接开root走动。原包/readme/VMD及metadata只留`artifacts/una-greet/`，没有动作数据进入Git。

## 点头：实际实现与证据

官方Overte单FBX来源、498,992bytes、哈希、Apache2版权/完整许可及派生说明见 [motion-nod-NOTICE.md](motion-nod-NOTICE.md)。没有下载Hanami VRMA或跑作者应用代码。使用官方动作图1–55帧非loop的完整点头窗口，只采样Spine2/Neck/Head；55源样本约10.5KB，不含目标PMX数据。遵守此次“资源不推repo”范围，JSON和原FBX都留ignored，不进入代码提交。

既有Three0.160.1 FBXLoader真实失败于缺轴手指空旋转轨。离线诊断只跳过该类轨道；FBX的BaseLayer动画连接与空tpose层已查，所选头颈胸轨均有完整56键。运行时采用源/目标肩轴、头颈轴参考基共轭转换世界旋转，再结合目标实际父级/grant转换局部姿态。并非仅改轨道名。缺必要骨/资源时退回原正弦nod；隔离fixture中的两形态均可用。保留原2秒生命周期和触发/取消guards，根/腿/手/morph通道不归此clip；0.18秒准备、0.4秒收势及0.75层权重，经原settle速率限制。默认尝试启用，可用`setNodSourceEnabled(false)`在隔离fixture对照。

stage只请求同源 `/character-assets/animations/overte-headnod.json`，credentials=omit，32KiB流读取上限、2秒abort及形状/有限数/单位四元数验证，404/损坏/超大/超时都回退，不阻断模型。没有改server：既有character-assets静态路由已支持该本地JSON。父审查代码后若授权安装资源，再将本机JSON连NOTICE/LICENSE放入主仓ignored的 `assets/characters/furina/source/mmd/animations/`；此任务没有触碰主仓资产或生产。JSON 10,488bytes（含换行），SHA256 `A8A12D5A11179C101E1C2A09EED8D3C42943133CEDD369F96817B89B9B9BC959`。缺资源的新页面仍用旧nod，不把code merge/build当已激活点头。

可视对照：原点头幅度很小，主要一次正弦头动；新源有抬起、下点、回正及小幅头颈/胸配合。双形态正侧面及中途取消后截图未见倒置、明显颈/衣领穿入或脚漂。源动作有较快的多次确认节奏，幅度也更大，不能据此宣布更符合角色或自然度完成。

## 验证与重放

- 15/15 Node tests通过：纯自造合成源测试nod准备/收势/参考轴旋转不变性/缺链fallback、有界本地加载器缺失/损坏/超大/不带credentials，既有idle缓存/脚底以及取消/重入/softening；没有把真实动作写入测试fixture。
- `node tests/motion-nod-review.mjs`：单Edge/SwiftShader、随机本地端口、900×900、60Hz确定性推进；before/after×双PMX×nod/cancel的128张新鲜截图，20Hzworld采样及5取消/重启时点。12条结果、0pageerror。最大头世界步长0.048184rad/帧（含取消重启）；正常after nod最大0.038817rad/帧。原/新world pitch分别约[-0.052315,0.067594]/[-0.288088,0.249572]rad，仅定位动作幅度；所有脚踝及D变形骨位置漂移<1e-8模型单位，口形0.3、笑形0.28保留。
- 缺资源浏览器检查 `node tests/motion-nod-review.mjs --missing-only`：模型ready=true、适配available=false、原nod可触发和取消，0pageerror；证据 `artifacts/nod-visual-review/missing-source.json`。最终可视及组合回归走真实本地JSON加载路线，资源没有被bundler打包。
- `EXO_MOTION_BASELINE=f8ca400 EXO_NOD_SOURCE=artifacts/overte-nod/overte-headnod.json node tests/motion-idle-regression.mjs`：双PMX前后各180秒idle、greet/nod、取消/重启、停说话、模型切换通过，无pageerror。idle头步长仍0.005617rad，取消肘≤0.075001rad，greet回待机误差≤0.003533rad；nod局部头步长最大0.027490rad（原0.008025）。旧nod经验阈值0.02调整为原代码既有2rad/s局部速率合同(2/60)，没有放宽实际settle代码。
- Vite隔离build与OpenSpec strict通过；既有大chunk提示。没有真实模型/语音/用户感知验收。

重放先设置 `EXO_MOTION_ASSETS` 为现有PMX只读目录。自己的browser/server均在finally关闭，目前两个自有运行PID已退出。证据：`artifacts/nod-visual-review/evidence.json`及before/after PNG，`artifacts/cc0-idle-regression/evidence.json`及截图，`artifacts/nod-review.*.log`和`nod-idle-regression.*.log`。无录屏工具，本次仍为密集截图序列，不能替代连续播放感知。

父线程可独立审查点头代码提交及本机资产；招呼演出下一步需明确同意已列包内条款。本次没有因招呼源阻断而停止点头工作，没有部署授权；合并、本机资源安装、部署与整体体验验收仍由父协调。
