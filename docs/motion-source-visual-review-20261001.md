# 动作来源与真实 PMX 隔离可视审查

## 交付边界

独立 worktree `C:/Users/zhu06/AppData/Local/Temp/exo-motion-visual-review`，分支 `motion/visual-coordination-review`，基线 main `2297fa0`。遵循任务中的受限范围，未修改产品 stage/motion、turn 生命周期、服务端、ASR 或记忆；未启动/重启生产 app、TTS，未操作用户页面、读密钥、调用付费 API、开麦克风。没有下载新模型/权重、执行远端软件或复制 D_sakiko 代码。

本交付是新鲜的双模型表现证据、成熟动画源的真实重定向试验及复现 fixture。**没有产品动作改善提交，不能标记自然度/活人感完成。** `coherent-turn-performance` 的 2.3、2.4 仍未完成。没有百分比质量报告。

## 当前表现与定位

`tests/motion-visual-sequence.mjs` 用随机 loopback 端口、独立 Edge、只读本机现有 PMX。两个模型分别 425/387 根骨骼；每种执行 60 秒 idle 及 greet/nod/cancel/speaking/thinking 六种场景，60Hz 固定时间步，10Hz 骨骼数值，25 个 idle 截图时间点及每动作 11 个截图时间点。共 160 PNG，12 场景，pageerrors 为空。是模拟时钟截图序列，**不是实际帧率或实时录像证据**；不能从稀疏帧排除短暂穿模/抖动，也不能证明人工体验。

实际查看过两形态 idle、greet、nod 的新鲜序列以及候选前后同场景帧，观察与实现/数值结合定位：

1. **下半身一直像固定站架。** 躯干和手臂有差异，但双腿笔直、双脚并拢、髋部无重心转移。两模型 60 秒双脚踝 xyz 范围严格为 0，头部 xyz 范围约 `[0.273,0.029,0.293]` 模型单位。脚稳定是工程边界，不能代替站姿自然；上半身骨原点位置不动也不代表胸部没有旋转。需要带重心/膝部配合的动作源并解决脚 IK，不能仅继续增加头部角度。
2. **招呼主要是手臂举起、再放下。** 0.5 秒手臂已明显向外、1.4 秒手在脸侧、2.8 秒开始收回；头/胸配合可见但小，腿部和整体站姿未参与准备与收势。原有角度/取消上限仍应保留；没有来源合格的招呼 clip 前不凭想象重新手调角色动作。
3. **待机三姿态固定轮换，说话大部分时间只剩口型。** 5/15/25 秒静帧的头与手轮廓有变化；源码的 `time % 30` 每10秒切槽可核验，不能说整幅姿态严格30秒重复，因为呼吸/眨眼另有周期。原 speaking accent 只在 mode 进入后的短窗发生，长说话与静默的身体区分有限。需要不同停顿、非固定顺序以及明确的说话 clip 调度，避免持续摇摆和2–3秒机械 loop。

没有独立的 `head-up` 动作 API；现 trigger 只有 greet/nod。没有以增加 API 的方式冒充抬头协调已完成。重复、取消、切换 guards 保持原样。

## 成熟方案候选与实际选择

| 方案 | 兼容性与体积 | 来源与权利 | 结论/服务风险 |
|---|---|---|---|
| Quaternius Universal Animation Library Standard + 现有 Three AnimationMixer | 作者标注15MB；实下载15,904,933 bytes；GLB/FBX，需PMX参考姿态/骨骼映射；已实测两个idle clip | [作者页](https://quaternius.com/packs/universalanimationlibrary.html)、[官方itch页](https://quaternius.itch.io/universal-animation-library)和包内License.txt均CC0；允许再分发，模型自身许可不随之改变 | **选作动画源试验**；无依赖安装、无服务重启、无推理GPU/付费；当前适配不合格，不接产品 |
| オトカム式_待機モーションパック | 原生VMD候选38.16KB；骨骼同名可直接绑定实际mesh，仍需双形态/缺bone检查 | [作者上传页](https://bowlroll.net/file/237411)仅确认文件名/大小，尚无完整资产许可 | 未下载、未嵌入，不把站点通用条款当资产授权 |
| かんな「何もしない」blink/breath VMD | 作者页标3.1KB；原生MMD，肩P骨/眼动适配需验证 | [作者说明](https://note.com/kanna3939/n/ne6f78c5dd276)、[作者BOOTH页](https://kanna3939.booth.pm/items/6123352)；同时列改后再分发自由和改后再分发禁止，页面还显示Private提示 | 未下载；不推断许可，不能进入公开Git |

Adobe [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)说明可在项目中免版税使用，但需要Adobe ID、存在地区限制；FBX还需跨骨架重定向且不能由FAQ推断raw文件可公开再分发。没有登录或上传受限PMX，不作为当前最小路径。

Three r160 [MMDLoader](https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/loaders/MMDLoader.js) 与 [MMDAnimationHelper](https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/animation/MMDAnimationHelper.js) 已安装。VMD按实际mesh骨骼名构建；多URL是merge，不是playlist。helper添加clips会play全部，默认sync可能改duration；未来采用单mixer、sync:false、physics:false、显式stop非idle、LoopOnce及渐入渐出。保留turn取消guards及动作拒绝重入。引擎MIT不授予示例VMD权利，不使用授权未知的bundled motion。

## 实际 CC0 下载与试验

仅通过官方免费 `No thanks` 下载路径获取Standard，未支付、登录或绕过站点限制。下载前核实来源/CC0/15MB及磁盘余量约333GB。ZIP先枚举，验证解压绝对路径处于自有 artifacts 后仅提取GLB/txt；未执行FBX/BLEND或归档内容。两个GLB共约15.24MB，ZIP约15.90MB，没有巨大缓存或额外下载。

归档SHA256：`CC73FC4E495B82958207316596317A3F40B9FA38065BDE1027937452DA537724`。无root motion的 `UAL1_Standard.glb` 7,618,436 bytes，包内43 clips，含 `Idle_Loop`（约2.5s）、`Idle_Talking_Loop`（约2.93s），**无greet/nod**。不能把120+宣传总数视为免费tier实际内容。

`tests/quaternius-pmx-review.mjs` 在同一独立浏览器内顺序检查双形态，每clip四帧 0/0.6/1.2/2.4 秒：

- 官方 r160 `SkeletonUtils.retargetClip` 加骨骼映射、去源position：倒置/严重肢体错位。失败证据 `artifacts/quaternius-review/`，16 PNG，无pageerrors。它不是改名就兼容，不能把loader成功当动作成功。
- 用源 `A_TPose` 世界四元数参考与目标实际PMX bind校正：倒置消除，真实身体/腿部/说话双手动作可见；但脚宽跨出且高度随idle改变，静默姿态垂头/双手靠后。证据 `artifacts/quaternius-corrected/`，16 PNG。这是小型试验自有适配，不复制外部实现；保留官方Mixer播放源clip，非手调关节角度。
- 再使用已安装的官方 CCDIKSolver，先控制骨IK再一次grant：大范围脚漂消除，但idle右踝y约1.195–1.211（原1.091），左踝y约1.242–1.250（原1.091），仍有接地偏差、未有脚底约束。证据 `artifacts/quaternius-ik/`。未自动启用Ammo/physics。

试验改善的是**适配正确性**（倒置消除、脚漂减小）、可见说话身体表达，不是自然度验收。短循环、垂头/手后放的内容适合性、手指朝向及服装/手穿模、脚底接地、准备→招呼→收势和动作间切换都未合格。不得将实验直接作为产品默认idle；没有把失败候选隐藏成“已完成自然idle”。

## 复现与下一步

仅本机已获授权的PMX路径；渲染PNG/JSON和下载文件含受限模型或本地试验内容，全部留ignored artifacts，不入Git，不上传Library、不传播模型。

```powershell
$env:EXO_MOTION_ASSETS='C:/Users/zhu06/Documents/ChatGPT/Project Exo/assets/characters/furina/source/mmd'
node tests/motion-visual-sequence.mjs before
node tests/quaternius-pmx-review.mjs
node tests/quaternius-pmx-review.mjs --corrected
node tests/quaternius-pmx-review.mjs --corrected --ik
node --test tests/stage-action-release.test.js tests/stage-softening.test.js
```

候选fixture依赖本worktree ignored `artifacts/quaternius-standard/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`，不是自动联网下载器。每次只一个独立Edge，所有自己的页面/browser/server在finally关闭。原main的node_modules只读junction，无依赖安装。

自动检查：5/5 stage softening/action-release Node tests通过；既有 `coherent-stage-review.mjs` 使用main2297fa0作为baseline，对两个PMX分别完成180秒idle、招呼重入拒绝、nod完成、十组取消/重启、说话stop、模型切换与口型/表情恢复，四组合均通过。头最大帧步0.002699827 rad，腕最大帧步0.235672模型单位；取消上限0.075rad/60Hz保持。该fixture的before/after标签是**相同产品代码回归**，不是产品改善对比。候选脚本另做main与候选同模型/相机/四个时间点截图对照；三轮试验均无pageerrors。两个新增fixture语法检查通过，OpenSpec `coherent-turn-performance --strict`通过。未运行全量npm tests或build，因为没有产品代码变更；不将此列为部署或主观验收证据。

下一实现应先用源/目标参考骨架验证朝向与骨链/肩C grant兼容，再限定上身clip/稳定脚底与接地，加入动作mask及不固定循环调度；取得原生招呼/点头明确许可，或参考实际动作准备收势制作最小自有clip。须复做30–60s连续对照及取消/双形态回归。当前没有技术理由迁移引擎或加推理服务，也不能把这些候选的加载成功当角色活人感。
