# 本地点头适配集成审查

基于已发布main `f8ca400a59100f92f832d6b6a4a790df800aef7d`，独立worktree `artifacts/worktrees/nod-adapter`、开发分支 `milestone/nod-adapter`。源提交2a09a703接为a489b0a；仅nod/stage/tests/docs/spec改动，无server/provider/turn/ASR/记忆变化。未合main、未部署、未在生产安装JSON；idle专项发布许可没有挪作nod发布授权。没有操作独立wave worktree或演出wave。

## 来源与安装边界

重新读取[Overte官方LICENSE](https://github.com/overte-org/overte/blob/master/LICENSE)、[完整Apache2许可](https://raw.githubusercontent.com/overte-org/overte/master/LICENSES/Apache-2.0.txt)、[官方动作图](https://raw.githubusercontent.com/overte-org/overte/master/interface/resources/avatar/avatar-animation.json)：positiveHeadNod为帧1–55、timeScale1、非loop。原研究者逐级目录/交叉来源核查记录保留，不将该授权扩张至wave。

现有本机FBX498992bytes，SHA256 `aacd3d6eab3986ff2ba0be332bf379dfb5d7c13c2293e8403bbb53b76aaf4c39`，Git blob `dbb46c1c5f8670c67d4a1a4f3f713f2b93fed419`，与NOTICE一致；JSON10488bytes、SHA256 `a8a12d5a11179c101e1c2a09eed8d3c42943133cedd369f96817b89b9b9bc959`核验一致。只在本机ignored验证目录复制JSON、LICENSE与NOTICE；源FBX/JSON、目标PMX/纹理、截图不进Git。没有重新下载资源。

若后续获独立发布/安装授权，资源目标为`assets/characters/furina/source/mmd/animations/overte-headnod.json`，旁边保留`motion-nod-LICENSE.txt`与`motion-nod-NOTICE.md`；安装前必须核对上述hash。此时仅代码merge/build不能算点头激活，缺资源新页面仍用旧nod。

## 审查修复

保留源/目标参考轴的共轭转换、真实parent/grant映射、2秒生命周期、0.18秒准备/0.4秒收势/0.75权重、根/腿/手/morph原所有权。补具体边界：原validator会接受重合/平行参考轴；现源与目标几何轴退化或非有限均回退且不改骨，空sample返回false。原helper允许其他URL及默认重定向；现只接固定本地路径，credentials omit、redirect error，其他URL在fetch前拒绝，保持32KiB和2秒上限。加入无额外fetch、损坏/超量/缺失、退化源/目标、2秒abort等回归。

## 联合证据

- Node45/45（5.25秒）：nod/idle/动作释放/softening、ASR实际HTTP与录音草稿、speech队列、自然记忆集成；使用隔离数据和worker/provider/audio替身，无真实模型或付费。
- 单Edge/SwiftShader双PMXbefore/after点头及取消对照：12条结果/128本机截图、5取消重启时点，0pageerror，最大头世界步长0.048184rad，脚踝/D变形骨漂移<1e-8，mouth0.3/smile0.28保留。缺资源ready=true、available=false、旧nod触发/取消成功。看过本次新鲜正侧面与取消截图，未见明显颈/衣领穿入或倒置，不能排除细小碰撞或替代连续观看。
- 当前idle基线双形态、前后180秒idle/greet/nod/取消/重启/停说话/切换模型通过。after nod局部步长0.027489rad，低于既有2rad/s即2/60速率合同；idle头步长0.005617、greet回待机误差0.003533内，mouth/blink/表情与脚固定保持。未修改实际settle上限。
- 隔离browser7/7（48.4秒），含有序段说话/迟到取消/TTS失败恢复、记忆修删、三项录音草稿、PMX原动作，以及新增实际app静态路由和nod UI用例。新增用例再以明确425/387骨等待确认两形态重跑1/1，检查UI点头/停止取消、损坏JSON回退，events/memories/episodes及费用0。该用例仅在EXO_NOD_SOURCE显式启用且本机资产已布置时运行；默认跳过而非假造源资源。
- build通过（877.99KB JS、258.87KB gzip，既有大chunk提示）；OpenSpec全仓strict17/17、diff检查通过。生产dist未变。

日志在`artifacts/nod-integration/`；视觉和数值证据在`artifacts/nod-visual-review/`与`artifacts/cc0-idle-regression/`，不提交。所有自有fixture/browser/server关闭，未开麦克风、识别、声线服务或操作用户页面。PMX副本仅本机ignored，真实正式库未注入任何内容。

## 后续

开发分支可供独立复审，无实现阻断。需另行确认nod发布与本地资源安装，保留生产idle与base ASR。动作较原nod幅度更大、带较快的多次确认节奏；角色适合度/自然度未验收，不称招呼问题或体验任务2.3/2.4完成。wave由独立owner继续其任务，其许可与视觉不能由nod代替。
