# 独立最终验收

## 13:10 后续授权补齐：参考声线删除／解绑

13:18只读核验本人13:17执行的一次真实DeepSeek短测试：deepseek-flash、completed、输入354／输出41token，usage估计¥0.001036（不是账单证明），保守预留¥0.06508，累计1/3次、剩余预留预算¥8.93492。验收者未代点／未读取key，未追加调用；未据此验证听感或persona稳定性，也未启用普通聊天自动LLM。下面的零调用数是13:10本人接入之前的验收快照。

13:14收尾审查补充：TTS超时隔离时即使Node active已清零，GPU状态仍不确定，删除／恢复必须409拒绝；新增该保护及单元断言，59/59复测通过。网页／其余回归为该一行后端保护之前的15/15；前端/build未再改变。用户正在本人填写key／点击短测试，按明确指令不刷新／重启其服务；删除功能主体已在13:06部署，该最后超时隔离保护须等本人测试结束后下次app重启载入。当前TTS健康且未隔离。本人回报空输入短测试会关闭设置并在主页面提示，已记录UX问题，按指令此时不改UI。

用户明确授权后补齐自定义声线／非 neutral 表达的网页删除与恢复，未扩展其它产品功能。UI二次确认，可取消；生成、队列或登记更新中409拒绝。只操作带managed/speakerId/importedAt元数据的import-UUID.wav，拒绝路径重定向、共享引用、内置profile。先备份音频与SHA256清单，再原子移除registry，最后删除已知受管理副本；原录音路径从不提供给服务。可恢复副本保留本机（最多20条），并非彻底擦除。恢复不覆盖同ID、不同speaker、已登记表达或不同文件。

可丢弃3.2秒tone测试验证了删除后HTTP合成400且不调用后端，其它speaker/profile逐字段不变、原录音逐字节不变、跨重启登记移除和恢复、实际LocalTts队列运行／等待时拒绝删除、冲突／损坏音频／junction拒绝。网页实际组件验证取消确认、neutral回退、整声线删除、跨tab旧播放停止、设置同步及重启恢复。测试使用协议fixture，不冒充自定义真人声音的真实GPU合成；既有RAVDESS真实TTS仍完成全套回归。

最新回归：59/59 Node（零失败/skip），15/15 Edge（真实PMX/GPT-SoVITS/SAPI零skip），Python边界6/6，build成功（JS748.71kB/gzip214.17kB，大chunk提示保留），OpenSpec四项strict通过。日志为deletion-unit.txt、deletion-browser-traced.txt、deletion-python-boundary.txt、deletion-build.txt、deletion-spec.txt。第一次全套14/15，最后PMX手机截图45秒超时，保留deletion-browser-first-failure.txt；单独trace复测11.8秒、随后全套2.4分钟15/15通过。根因未证实，不再把并行探针称为已证实解释，也未提高超时。删除UI初次测试曾在恢复列表刷新后过早断言voices；已清除旧完成提示、显示正在更新，并等实际操作释放后断言。

13:06仅重启app载入新接口，app77724/TTS67988于13:10健康且active=false/pending=0。正式参考仍仅内置RAVDESS，managedProfiles=0、恢复记录=0；没有删除任何正式用户素材。13:10预算0调用/¥0预留/¥9剩余；13:10后本人接入测试的用量另核对，验收者不点击远程测试、不读取key、不再重启／刷新其页面。

reference-management-private.png和reference-management-mobile.png已实际查看像素，手机无横向溢出，无pageerror。截图仅项目自有管理区，无模型像素、凭证、原录音或消息。一张已通过Library技能私有上传，ID仅在忽略目录library-delivery.json及交付消息；Windows不支持技能脚本的os.setxattr，本地关联元数据写入失败，Library创建本身成功。模型原始readme未明确允许截图交付，因此PMX验收截图不上传。

13:10资源快照：GPU4302/8188MiB，TTS RSS2463MiB，app61MiB，RAM可用3750/16092MiB，磁盘剩余313.18GiB；runtime逻辑15,849,607,982字节约14.76GiB，assets26,747,361字节，data3,888,153字节，artifacts28,378,736字节。无新大模型下载／训练，后续变化仅日志、测试及构建输出。下面保留首次独立验收的历史基线与证据。

2026-09-30 11:45 UTC 开始，新上下文独立执行；起点 main `5f092a4fa977e71d0ffa73cdde71a39c2b8a6acc`。授权截止 14:30 UTC / 多伦多 10:30；无需填满剩余时间。当前可以进入最后用户接入阶段，但不是角色音色、真实 LLM 或人工听感的最终通过。

## 打开方式

当前服务已运行，直接打开 **http://127.0.0.1:3000**。若已停止，在项目目录普通 PowerShell 运行：

```powershell
npm.cmd run local:start
npm.cmd run local:status
```

等到 app、tts 均 `ready=true` 再试听；停止用 `npm.cmd run local:stop`，先停止播放并等待生成队列释放。无安装、下载、管理员权限或执行策略改动。纯演示可用 `npm.cmd run local:start -- --app-only`。这些是已安装资源的入口；干净克隆仍需要 README 的依赖安装/构建，以及自行提供合法 PMX 和按本地 TTS 文档安装现有依赖，不是无需资源的一键安装器。

## 本轮发现和修正

1. 直接访问 9880 `/tts` 原先可绕过 Node 登记和资源校验。现在后端也限制 32,000 字节请求、300 字正文、登记目录内的绝对参考路径与精确转写/语言、许可和同 speaker 元数据、3–10 秒 PCM16、固定单任务非并行 WAV 参数、0.7–1.3 语速；额外资源参数拒绝。路径先做字面范围检查再解析，避免任意绝对/网络路径解析。上游官方依赖未修改。
2. 解析后的转义 key 原先虽不泄露 key，仍生成、保存和朗读安全离线替代回复。现在这种安全失败直接返回 502，本轮无任何 events/history/朗读，编辑中的输入保留；正常网络故障的明确离线替代行为保留。
3. 手机标题遮住脸、桌面控件压住鞋部。舞台为文字和控件留出独立空间，重新截图确认完整身体和手机操作入口可见。
4. 原版 PMX 浏览器测试写正式 data，删除其测试记忆会按产品契约清空聊天上下文。首次原版复跑暴露这一测试隔离问题；已改临时数据库，最终全套复跑不再写正式记忆/聊天。未手动广泛清空或恢复正式数据库；首次复跑前未取得历史基线，不能由最终零行倒推此前没有聊天。

## 通过清单与证据

| 范围 | 独立结果与证据 |
| --- | --- |
| 全套回归 | `npm.cmd test` 52/52，零失败/取消/skip；`npm.cmd run test:browser` Edge 14/14，含实际 PMX、GPT-SoVITS 和 Windows SAPI，零 skip；`python tests/tts_boundary_test.py` 6/6。日志在本机 `artifacts/final-acceptance/unit.txt`、`browser.txt`、`python-boundary.txt`。Python 6 项单列，不冒充 Node 52 项。 |
| 构建/规范 | Vite build 成功；JS 745.30 kB / gzip 213.31 kB，保留大 chunk 提示；OpenSpec `validate --all --strict` 四项通过。`build.txt`、`spec.txt`。规范通过不代替功能验收。 |
| 启动器 | 独立复用原 app64356/TTS64412；无关 fixture PID61296 占 3000 时 start/stop 均拒绝，fixture 存活且 TTS 不动；完整停止重启成功；GPU 冷加载期间重复 start 复用 launcher，最终核对真实监听 PID。`service-lifecycle.json`。Windows CIM 在 agent 沙箱内被拒绝，使用沙箱外的普通用户权限运行，未提升为管理员。 |
| 两个 PMX | 实际载入 31,099 vertices / 425 bones 和 29,937 vertices / 387 bones，63 morphs；已查看桌面/手机全身、服装/纹理、挥手及近脸表情截图的实际像素；点头另有骨骼与变形回归。无 pageerror、无失败模型资产、无手机/设置横向溢出。`visual.json` 与 32 张 `model-*.png` / `settings-*.png`，含两模型手机全身和近脸六种状态。表情是轻微眉眼变化，不代表复杂表演或完整物理模拟。 |
| 真实中文 TTS 六表达 | RAVDESS24 neutral/calm/happy/sad/angry/surprised 均经真实 GPT-SoVITS v2ProPlus 生成有效、非静音 32 kHz PCM16 WAV。句子“今天辛苦了。让我们一起写好下一幕。”；3.84–5.00 秒音频，1.07–2.20 秒生成，削波比例 0；RMS 0.0058–0.0127。`tts.json` 与同名六 WAV，包含哈希。不是角色参考或情绪识别证明。 |
| 播放、口型、取消 | 浏览器真实音频进入播放状态、口型振幅变化、停止后口型归零；生成时取消后替代句可播放；表达/语速切换取消旧句并用于下一句。SAPI 为明确选择的临时备用。Edge 为静音测试，证明解码/播放管线，不证明扬声器实际可听或人工听感。 |
| 队列、真实故障与恢复 | 真实合成观察 active=true/pending=1，串行生成后回零；非法参考/资源请求被拒绝后正常合成恢复。另实际停止项目 TTS、仅启动 app：两次连接故障均 502、无自动系统声切换；重启 TTS 后生成有效 recovery.wav。`tts.json`、`service-loss.json`、`recovery.wav`。超时隔离/队列上限等极端路径由确定性 fixture 单元回归覆盖，没有将其冒充真实 GPU 压力/超时测试。 |
| 自定义参考入口 | 3–10 秒/4 MiB/格式/静音/削波验证，规范化本地预览，未确认不能登记；neutral 起步、speaker 固定和确认、happy 追加、跨 tab 声音选项刷新与停止、重启保持登记；放弃未登记预览后 URL404，已有登记不变。单元覆盖 speaker 不一致、ID/路径越界、junction、原子失败、忙时拒绝、过期/容量。浏览器使用 3.2 秒合成 sine，明确是 UI/协议 fixture，未用它证明真实人声合成。 |
| 共同记忆 | 临时数据库下保存、来源追溯、冲突纠错、删除、重启持久化、旧请求抑制、跨 tab 停止和上下文清除通过。十轮聊天后 history 仅16条、不含第一轮，但页面第一轮可通过 `/api/sources/:eventId` 和角色 context 验证并保存；来源请求故障保留草稿且不写记忆，恢复后成功。 |
| key echo 修复 | 普通 JSON 和 fenced JSON unicode 转义假 key 都经 parse 后拦截。真实临时 SQLite events 数量0、history空，浏览器无回复、无 speech dispatch，输入保留。provider 协议全部是本地 fixture；只用显式假 key。 |
| persona/provider | 两时点×三风格的 prompt 契约、官方背景/用户事实/主观感受区分与 context 隔离通过。七 provider 的配置/协议由本地 fixture 测试；页面真实显示有限规则演示、模型/key为空、协议替身不等于真实验证，刷新清 key，切换不发请求。 |
| HTTP/文件边界 | 3000/9880 实际恶意 Origin、Host（原始 HTTP，避免 fetch 规范化 Host）、cross-site 均403；9880控制路由403、未登记/资源参数400、大 body413。Node 同源读取/写入、排除文件和 reference junction 等额外回归通过。未请求实际凭证内容。 |

参考入口新截图在本机 `artifacts/stage-four/reference-preview.png`、`reference-mobile.png`、`reference-confirmation.png`；`visual-evidence.json` 时间为本轮 12:10 UTC。已实际查看预览和手机截图；材料仍为临时库中的 440 Hz tone。`expression-geometry.json` 另确认两模型五种非中性表达实际改变50–1300个顶点，最大位移0.0091–0.0409模型单位，表情幅度确实较轻。

保留失败证据：额外几何探测并发运行时，一次完整浏览器复跑为13通过、PMX一项45秒超时，日志 `browser-transient-timeout.txt`；单独复跑PMX为1/1、10秒通过，`browser-stage-isolated.txt`。并发资源竞争是推测，未证明具体原因；最终完整套件在无其他视觉探测时复跑，不隐藏失败或提高测试超时门槛。

## 未通过、未测与用户最后两类动作

- **用户后续授权的删除缺口已补齐。** 网页显式确认删除自定义声线／非 neutral 表达，并可恢复；后续记录单列测试与边界。未删除任何正式用户材料。
- **未测：真实远程/本地 LLM、真实 persona 稳定性、长时间关系/人格成长。** 无 key、未读 `.env`/桌面 key/应用凭证，没有真实 LLM 或付费调用，未使用未来人民币9元测试额度。不要把规则回复、契约或 fake provider 当作该项通过。
- **未测：角色声线相似度、人声身份识别、人工自然度/情绪/噪声/响度/长时间听感。** RAVDESS 是许可的非商业测试声，非芙宁娜；没有已授权角色 reference、没有训练或新大模型下载。机器只校验格式/时长/声学边界，speaker ID 和预览试听确认由用户负责。
- **未测：实体手机与其他浏览器。** 手机 UI 是 Edge 的390×844视口检查；未运行iOS/Safari/Android设备。服务仅监听本机loopback，不承诺手机远程连接。
- 用户动作 A：本人填写模型名/API key，刷新会清除 key。未来如要执行唯一获准的 DeepSeek 短测试，先复核当时官方模型/价格和24小时价格快照，再在人民币9元/最多3次/128输出token限制内明确执行；本验收不代执行。
- 用户动作 B：提供有权使用的同一个说话人 PCM16 WAV，先 neutral、再各表达，准确转写和来源/许可；本人完整试听预览及合成句，确认音色、自然度、音量和表达。与 API 接入分开验收。

## 最终服务、资源和私人资产

12:14 UTC 普通用户 status：app **73372 / 3000**、TTS 实际监听 **67988 / 9880**，均 ready=true；TTS active=false/pending=0。正式 history/memories 当前各0；budget usedCalls=0/reservedCny=0/records空。

最终资源快照 `resources.json`：RTX4060 Laptop 8GB，显存约4310/8188 MiB；TTS RSS约3512 MiB、app约65 MiB；16GB RAM可用约3611 MiB，C盘空闲313.21 GiB。`.runtime` 逻辑文件大小15,849,568,187字节（约14.76 GiB，包含依赖、缓存和权重，非本轮新下载量）；assets约25.51 MiB，data约3.71 MiB，artifacts约26.97 MiB。本轮无模型/参考下载，`setup-local-tts --verify` 仅核对已安装118包兼容性和CUDA。

Git 文件名检查无 PMX/音频/权重/参考素材/secret/.env/runtime/截图；tracked 文件的常见私钥/token形状扫描无匹配，不能据此声称数学上排除一切秘密。Git ignore 实际匹配上述私有目录和新增 Python 缓存。仅提交代码/测试/文字记录，未上传任何截图、音频、参考素材或模型；无私信、充值、提权安装或全局设置变更。最终提交和远端 main 的一致性以本轮 Git 操作结果为准。
