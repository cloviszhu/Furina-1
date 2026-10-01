# 角色知识最小 provider 接线：独立审查交接

分支 milestone/character-context，worktree `C:/Users/zhu06/Documents/ChatGPT/Project Exo/artifacts/worktrees/character-context-integration`，基于已发布main3842fcf。已按依赖顺序汇合1afc9a34和0535c30；仅新增 adapter/集成fixtures/docs，并修改 providers。未修改 frontend、ASR、main或运行中的生产app/TTS。

## 审查判断与接线

新包12条、11enabled、1pending；新增住处、日常饮食、演出转变、Vision时点与转述获知，具有有限相关对话价值，不再只是甜点。官方托管/二手转写资格按原模块账本保留，direct-game primary仍为0。本次审阅模块和来源账本，未重新独立核验游戏原始文本/音视频，也不宣称剧情知识完整。

providers.messagesFor先按旧逻辑构建完整persona、用户来源化互动证据、手动确认记忆、历史及当前输入。新server/character-context-adapter.js随后仅用当前query、已选timeline调用resolver，固定perspective=furina、edition=4.2。用户配置里的author等字段不能改变角色视角。没有将互动数据重新投影进resolver，也不重复注入interactionPrompt。

canon独立最多2条/1024 UTF-8 bytes（含模块头、JSON行和换行），另有来源资格提示。上述1024不是完整请求增加量或token数；资格提示与JSON转义同样计入最终请求实际序列化UTF-8大小。先保留原有全部互动预算；只用既有16000bytes总输入余量，实际超限则按2→1→0整条舍弃canon，不截断或挤掉用户内容。原输入本就超限时仍由既有预算保护拒绝，不因canon删历史。

canonicalfact是资料分区、不是direct-game核实等级；prompt明确来源资格、reported非亲眼、理解/意向非完成、用户自述不覆盖canon。只投影选中内容，不把source目录、pending文本、核验待办或排除说明送入模型。canon前置于原system数据，旧persona和原对话依据尾部保持；空query/短噪声/无关闲聊不加资格提示或canon，不靠旧甜点历史召回甜点。

原DeepSeek费用预留对加完canon后的完整messages计费，128输出token/stream:false/一次请求/显式收费保护未改。测试只有fake provider和临时SQLite，不运行真实付费请求。

## 验证证据与待办

`node --test tests/character-context.test.js tests/character-context-integration.test.js tests/persona-natural-recap.test.js tests/persona-recall-grounding.test.js tests/providers.test.js`：50/50通过（0.345秒）。新增6项覆盖三组timeline成对过滤、reported与eyewitness、无关query/旧甜点不注入、用户事实与canon分区、靠近16000bytes上限完整保留原数据、实际HTTP消息/隔离自动记忆/完整请求费用预留。fake remote reservation证明input_bound精确等于完整messages字节+1024，不是实际消费。

OpenSpec sourced-character-context strict与语法/diff检查通过。未跑build/browser/相同全量tests：未改UI，实际HTTP与provider边界已覆盖当前变化，且父要求不额外重负载。工程检查不证明模型真的遵守时间线、真实剧情全覆盖或角色感知质量。需独立review后由父决定是否汇合；当前不得部署或推main。

## HEADER 措辞复审

按父线程的nonblocker审查补充，将模块HEADER的“canonicalfact 为事实”改为“来源化剧情陈述，核实等级见 sourceStatus，不表示已核实为原始游戏事实”；characterinterpretation明确为理解或解释。分类名不再暗示核实资格。既有模块和HTTP adapter相关检查30/30、语法/diff检查通过，含更长HEADER的字节临界和整条舍弃边界。修改仅留开发分支；此次main合并/本机发布的自动审批因授权不够明确而拒绝，暂停发布等待用户范围回复，没有换工具绕过。
