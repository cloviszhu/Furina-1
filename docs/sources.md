# 已核对来源与实施记录

本阶段使用与本机安装版本相同的 [OpenSpec v1.13.1 Getting Started](https://github.com/Fission-AI/OpenSpec/blob/v1.13.1/docs/getting-started.md) 和 [Workflows](https://github.com/Fission-AI/OpenSpec/blob/v1.13.1/docs/workflows.md)，以及 CLI 返回的 instructions 模板。采用 proposal/specs/design/tasks → apply → 实测 → 同步规格/归档；发现实现问题可回修规划，格式验证不等于效果验收。

用户明确要求立即自主实施，因此已授权的实施不因生成技能中的默认规划停顿要求再询问一次。当前变更：`stage-one-interactive-furina`，正式 apply 输入已返回 ready，10 项任务。

直接依赖从 `https://registry.npmjs.org/` 核实：Three.js 0.160.1（MIT，包解压大小 31,556,156 字节），Vite 8.3.1，Playwright 1.63.0。锁定旧版 Three.js 是因为该版本含 PMX/MMDLoader；不自动更新到移除该模块的版本。其他依赖许可与总安装体积在安装后记录。不下载 Playwright 浏览器，使用已安装 Edge。

PMX 适配参考 [Three.js r160 MMDLoader 官方源码](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/loaders/MMDLoader.js) 和 [MMD Tools PMX 读取源码](https://github.com/MMD-Blender/blender_mmd_tools/blob/main/mmd_tools/core/pmx/__init__.py)。[D_sakiko](https://github.com/MacchaPafe/D_sakiko) 的仓库标为 GPL-3.0；本阶段未复制其代码，只参考架构，不把角色资产许可与源码许可混同。

现有 Windows SAPI 只读枚举发现 Microsoft Huihui Desktop（中文）和 Microsoft Zira Desktop（英文）。System.Speech 首次枚举失败，因此采用实际可用的 SAPI 测试本地 WAV 生成，不安装新声音。该声音不是芙宁娜原声。

安装后直接依赖许可：Three/Vite 为 MIT；Playwright 为 Apache-2.0。项目内 npm 19 包，文件合计 84,878,030 字节，无浏览器二进制或模型权重下载。

模型协议已查官方 [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat)、[Kimi Chat](https://platform.kimi.com/docs/api/chat)、[DeepSeek Chat](https://api-docs.deepseek.com/api/create-chat-completion/)、Anthropic 官方 SDK 的 [Messages](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts) 与 [客户端](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts)。Anthropic 整页超出工具限制，采用官方 SDK 核对。GLM 官方文档访问失败，真实接入前复核。

DeepSeek 采用 [官方人民币价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，2026-09-30 核对：Flash 高峰/缓存未命中输入 2 元、输出 8 元/百万 token；Pro 输入 9 元、输出 27 元/百万 token。10 倍保守预留、3 次、128 输出 token 与输入字节上限，不用折扣，超 24 小时重核。用户上限 9 元不授权其他服务消费。

所有远程模型真实调用均未测试，不以本地替身冒充真实服务成功。
