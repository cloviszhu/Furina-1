# Project Exo — 最终独立验收交接

2026-09-30，最终独立验收。用户授权到14:30 UTC / 多伦多10:30。新上下文已独立复核并完成必要缺陷修正；可进入最后用户接入阶段，不需为填满时间扩展功能。

13:18本人接入更新：13:17一次真实deepseek-flash短测试completed，输入354／输出41token，usage估计¥0.001036、保守预留¥0.06508、累计1/3次、剩余预留预算¥8.93492。这是只读status核验，验收者未读取key／代点／追加调用；普通聊天仍demo，听感和真实persona稳定性尚未通过。以下13:10零用量是此前快照。

最简入口：[START](../START.md)，当前直接打开 http://127.0.0.1:3000。若已停止，在本目录普通 PowerShell 运行 npm.cmd run local:start，再 local:status 等 app/TTS 均 ready=true；停止用 local:stop，先停止播放并等队列释放。无安装、下载、管理员权限或执行策略改动。

最终服务：app PID77724 / 3000，TTS 实际监听 PID67988 / 9880，13:10 UTC均ready，active=false/pending=0。13:06仅重启app载入删除入口，TTS未重启；13:10后本人接入，不再刷新其页面或重启服务。PID会变化，下一次必须重新status，不盲用旧PID。

独立结果与完整证据见 [最终验收](final-acceptance.md)。删除补齐后最新59 Node unit、15 Edge browser、6 Python boundary、build、四项OpenSpec strict通过，实际PMX/GPT-SoVITS/SAPI零skip。首次全套14/15，最后手机PMX截图45秒超时；独立11.8秒、保留失败trace的全套15/15复测通过，根因未证实，未提高门槛。真实六表达中文WAV、串行队列、实际后端断开及重启恢复通过；两PMX桌面/手机全身及表情近景已实际查看像素。

本轮修正：9880直接接口的登记路径/转写/请求及资源边界；JSON/fenced unicode key echo安全失败整轮无DB/history/speech；手机标题与桌面控件遮挡；PMX记忆测试改为临时库。十轮后早期来源direct eventId/context检查和故障保留草稿已加浏览器复核。

用户后续授权的删除缺口已补齐：参考录音管理区提供显式确认的自定义声线／非 neutral 表达删除与恢复，生成／排队中拒绝，内置 RAVDESS 与原始录音不变；可恢复副本继续保留本机。删除当前引用后本页及其它标签页取消旧播放，回退可用声线／neutral 并明确显示选择；不自动改用系统语音。用可丢弃 tone fixture 验证，未删除正式用户材料。

13:14追加超时隔离拒绝保护（计算状态不确定时409，59/59单元复测）：因本人正在接入key／短测试，明确禁止重启／刷新，其最后一行后端保护待测试结束后的下次app重启载入；删除主体已13:06部署。空输入短测试关设置并回主界面提示的UX已记录，用户要求此时不改UI。

未通过/未测必须保留：真实LLM、persona稳定性、角色相似度、人声身份识别与人工听感均未验收。自定义导入／删除UI用明确的合成tone fixture，不能当真人声音或真实角色参考验证。真人播放设备可听与质量需本人试听；自动浏览器静音只验证播放/口型管线。

用户最后两类动作：A 本人填写模型/API key，未来获准的DeepSeek短测试先复核官方模型价格，仍受人民币9元/3次/128输出token限制，本阶段零真实LLM/付费调用；B 提供有权使用的同说话人PCM16 WAV，确认转写/来源许可/完整试听，再人工验收音色、自然度、表达、响度。当前RAVDESS24是CC BY-NC-SA4.0非商业测试声，不是芙宁娜；没有已授权角色reference、没有训练或新大模型下载。

本机截图/真实WAV及机器证据在忽略目录 artifacts/final-acceptance/；参考入口旧截图在 artifacts/stage-four/。新管理区桌面／手机截图已看像素，无模型、凭证或消息；一张项目自有UI截图已私有交付Library，ID与本地元数据失败记录仅留忽略目录library-delivery.json（Windows无os.setxattr，不影响私有上传成功），未上传公网。模型readme未明确授权截图交付，模型像素只留本地。13:10显存4302MiB/8188MiB，TTS RSS2463MiB，RAM可用3750MiB；runtime逻辑大小约14.76GiB，非本轮下载量。13:10验收快照预算usedCalls=0/reservedCny=0；随后本人测试用量另核对。首次原版PMX测试的隔离问题与基线限制已在最终验收中准确记录。

无读取真实凭证/.env/桌面key，无私人消息、充值、提权安装或全局设置改动。PMX、音频、权重、参考素材、secret、runtime、截图不进入Git。只提交代码、测试和文字记录，main / cloviszhu/Furina-1，不force、不改可见性；最新提交用git log -1与远端main核对。

历史：[第四阶段验证](stage-four-validation.md)、[角色契约](character-contract.md)、[本地TTS](local-tts.md)。历史PID/计数不作为当前状态。
