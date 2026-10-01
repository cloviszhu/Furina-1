# CC0 idle 适配联合审查交接

基于当前已发布main `2297fa01827640c8bc56162f76fcae62deae64c4`；独立分支 `milestone/idle-adapter`、worktree `artifacts/worktrees/idle-adapter`。前置5fc4e28与实现b56a2c4分别接为82955f4、7de51ed；没有冲突，没有改main/生产/ASR/turn/记忆/provider/用户页面。本阶段仅开发分支供独立复审。

## 来源与分发审查

重新读取[作者官网](https://quaternius.com/packs/universalanimationlibrary.html)及[作者itch页](https://quaternius.itch.io/universal-animation-library)，确认Standard免费包和CC0，未购买Pro/Source。包内License.txt也明确CC0。既有本机ZIP SHA256与账本一致：`cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`；本机无root-motion GLB SHA256为`69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`。

独立ignored目录离线重建76样本/20源骨派生数据，与提交idleSource对象deepEqual；只有源rig参考和运动，无用户PMX坐标、几何或纹理。换行规范化后的派生文件SHA256为`c1ce7b805e420c1a2aa2efcc2a008a37c272676b569c91973f2a8808e0a05823`（worktree Git checkout的CRLF原始hash不同）。未下载新资源。PMX及截图不在Git，校验用副本仅本机ignored目录，约26.75MB；不外传。

## 实现判断与视觉证据

参考肢段/掌轴修正A/T-pose差异、按腿长换算髋位移、固定脚踝的位置/朝向；私有骨架采样避免真实骨架逐帧重置与mixer常量缓存相冲突。source仅静默auto idle渐入，非idle/动作/显式姿态渐出；既有头部世界视线、mouth/blink/表情通道保留，缺链回退，切换模型释放旧mixer。未发现当前双PMX有倒置或明显手进入衣摆的新问题。

查看原作者双形态最终正侧面截图，以及本次新鲜greet、取消18帧和idle侧面；未见上述严重可见问题。此检查不排除所有小碰撞、衣物动态或连续播放节奏问题。原作者14场景为其阶段证据，本次没有冒称重跑同一14场景。greet/nod仍旧程序实现，不能把idle采样当作新招呼/点头动作；单clip慢放与速度漂移仍可能识别为循环，OpenSpec任务2.3/2.4仍未勾选。

## 当前main联合验证

- Node目标42/42通过（5.39秒）：idle/旧动作释放/softening、speech queue/contract、ASR HTTP/录音草稿、自然记忆集成、canon provider fixtures。隔离数据库和worker/audio/provider替身，不用真实服务、密钥或付费请求。
- 当前main基线双PMX、前后各180秒确定性idle、10个取消/重启时点、停止说话与模型切换回归通过，无pageerror；最大头步长0.005617rad/帧、手腕移动0.224678模型单位/帧、取消肘步长0.075001rad/帧内、恢复误差0.003533rad内；mouth0.3、smile0.279306保留，脚踝固定断言通过。这是骨架/通道证据，不是自然度评分。
- 隔离浏览器最终8项覆盖通过：有序说话及中断恢复2项、录音草稿3项、自然记忆来源管理1项、PMX页面1项、PMX动作连续性1项。首次6通过/2因模型junction被现有资源realpath边界拒绝而失败；改用本机ignored副本后重跑失败项，未放宽生产资源校验。
- 旧PMX动作测试另有起始固定姿态oracle不适用于移动idle：保留原差值诊断，改比同一时刻/clip phase的待机目标，阈值不放宽。最终初始差值0.036707rad、同相目标恢复误差0.020206rad<原0.03上限；角步长0.075rad、腕步长0.228181<原界限。产品代码未因测试而修改。
- review build通过，874.35KB JS、257.82KB gzip，保留既有大chunk警告；不替换生产dist。OpenSpec全仓strict17/17及diff检查通过。

本机日志在`artifacts/idle-integration/node.log`、`motion.log`、`browser.log`、`browser-pmx.log`、`browser-motion-final.log`、`build.log`、`openspec.log`；新鲜PMX数值及截图在`artifacts/cc0-idle-regression/`，不提交这些资产。浏览器运行串行、随机loopback端口、SwiftShader stage，临时数据和自己创建的browser/server结束后关闭；没有刷新用户页面、开麦克风、调用Whisper或声线模型。

## 下一步

推开发分支后等独立review，再由父安排发布。当前没有实现阻断；真实连续播放、角色相似度/听感、衣物与手指动态、有语义的招呼/点头和完整活人感仍未验收，不称产品体验完成。
