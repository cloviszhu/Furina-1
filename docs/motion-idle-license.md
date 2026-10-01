# 本地待机动作来源及分发账本

## Source

- 作者：Quaternius；作者页同时感谢动画师 Gonzalo Furnier。
- [作者官网](https://quaternius.com/packs/universalanimationlibrary.html)、[作者官方 itch 下载页](https://quaternius.itch.io/universal-animation-library)。核实日期：2026-10-01。
- 免费 Standard ZIP：15,904,933 bytes，SHA256 `CC73FC4E495B82958207316596317A3F40B9FA38065BDE1027937452DA537724`。
- 源：`Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`，7,618,436 bytes；使用无 root motion 版本的 `Idle_Loop` 及 `A_TPose` 参考；未使用 Pro/Source 付费包。
- 包内 License.txt 与作者页明确为 **CC0 1.0 Universal / Public Domain Dedication**，许可链接：[CC0](https://creativecommons.org/publicdomain/zero/1.0/)。无付费、账号登录或再分发 gate。

## Derived data

`src/motion-idle-data.js` 只含上述源 rig 的 20 根骨参考及 30Hz world rotation/源髋部位移，约88.6KB；76个样本、原2.5秒。用 `tests/bake-cc0-idle.mjs <本地UAL1_Standard.glb>` 可离线复现。派生数据沿用CC0，保留来源说明。原GLB/ZIP留ignored artifacts，不需随产品加载，也不执行归档内容。

没有用户 PMX、纹理、几何、源录音、权重或目标模型骨坐标进入派生文件。目标 PMX 的实际 reference axes、腿长、脚底固定点及 AnimationClip 仅在本机加载目标模型时计算，内存中使用，不写入分发资产。动作许可不改变用户 PMX 自身非商用/不得二配规则；模型及其渲染证据不提交或传播。

## Dependencies

使用项目已有 Three `0.160.1` 的 AnimationMixer、AnimationClip、SkeletonUtils.clone，Three 为MIT；无额外依赖、权重、Ammo或物理引擎下载。几何两段腿链约束与控制器代码为项目自有实现。未使用 D_sakiko 代码；未将 bundled VMD、BOOTH矛盾许可或BowlRoll许可未核实资产并入。

## Runtime boundary

仅适配 idle，greet/nod仍是既有实现。控制器不发请求、不下载资产、不触发语音、模型或后台聊天；不改变turn取消/重入API。private rig mixer不会进入scene或renderer，复用已有geometry引用；加载另一PMX时停止及释放旧mixer绑定。
