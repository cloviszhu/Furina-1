# Project Exo · 数字芙宁娜

**直接操作见 [START](START.md)**：普通权限启动/停止/健康检查，以及「导入我的参考录音」的本机检查、规范化试听和确认登记。密钥最后由用户本人填写。

第三阶段可运行：真实 PMX、待机/眨眼/招呼/点头与基础表情、本地 GPT-SoVITS v2ProPlus、六种表达参考、真实音频振幅口型、聊天与持久共同经历；已修复记忆纠改竞态，提供角色时点/风格及回复表达契约。

**默认对话是有限规则演示，不是真实 LLM。成熟 TTS 已跑通，但当前为 RAVDESS 非商业测试女声，未验收芙宁娜相似度或人工情绪自然度。系统声只是临时备用。** 见 [本地 TTS 安装与许可](docs/local-tts.md)。

设置中可选剧情时点、语言风格，以及手动或随回复字段的表达。切换声音/表达/语速会停止旧音频；TTS 不可用时需显式选择系统备用声。见 [角色与表达边界](docs/character-contract.md) 和 [第三阶段验证](docs/stage-three-validation.md)。

## 本机启动

需要 Node.js 24+，当前使用 24.19.0。Windows 可用已有中文 SAPI，无需管理员安装。

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run local:start
npm.cmd run local:status
```

打开 **http://127.0.0.1:3000**。服务仅监听本机。`npm.cmd run local:stop` 停止已核验项目进程，其他程序占用端口时拒绝操作。命令不下载、不提权、不改执行策略，GPU 冷启动时重复 start 会复用；仅演示用 `npm.cmd run local:start -- --app-only`。开发时仍可 `npm.cmd run dev`，或手动 `npm.cmd start` 后 Ctrl+C 停止自有终端；相对路径手工服务需在原终端停止后再迁移到工具。

## 本地资产

仓库不含模型。请从你有权使用的原始来源取得完整包，遵守作者说明，不提交、二次配布或商用。用户当前资产已整理到 `assets/characters/furina/source/mmd/`：

```text
mmd/
  【芙宁娜】.pmx
  【芙宁娜_荒】.pmx
  tex/
  sph/
  hair.bmp
  skin.bmp
  toon_defo.bmp
  readme【一定要看】.txt
  附件.zip
```

保留上述相对路径；附件无需解压。缺资产时显示安装提示，聊天与记忆仍可使用。见 [资产检查](docs/assets.md)。

## 使用与验证

点击招呼/点头，在设置中选择本地 TTS、表达并试听/停止，也可显式选择系统备用声。聊天后点击“保存为共同经历”，或手动记录。纠正/删除清空上下文并抑制迟到回复，其他确认记忆保留；同源其他页面也会停止旧内容。来源失效可改为手动记录。见 [独立 QA 修复状态](docs/stage-one-review-pending.md)。

```powershell
npm.cmd test
npm.cmd run test:browser
```

浏览器测试使用已安装 Edge 与本地资产，先运行项目与 TTS 服务。测试浏览器静音，仍验证真实音频解码/振幅口型；不代表人工试听验收。无可用 TTS/SAPI 时对应测试明确跳过，不能算通过。测试截图在忽略目录 `artifacts/`，包含模型图像，不上传。

## 模型与密钥

设置提供 OpenAI/GPT、GLM、DeepSeek、Claude、Kimi、兼容端点和 Ollama。模型与密钥默认空，切换不发送请求。密钥仅由用户本人填密码框，在页面内存中使用，刷新即清除，不日志、不入 Git、不读取其他文件或应用凭证。

普通聊天不自动调用远程 API。DeepSeek 仅由“一次短测试”按钮启动，本轮最多 3 次、128 输出 token/次、人民币 9 元累计上限，调用前按已核实官方高峰价保守预留。失败不重试，预留持久保留；价格超过 24 小时会拒绝调用。其他远程服务未获费用授权，保持禁用。本阶段真实 API 调用为 0，密钥接入留到用户醒来操作。

共同经历和无密钥预算记录在忽略目录 `data/exo.sqlite`。临时语音文本/WAV 随后清理。素材、声音数据、权重、凭证、运行数据均不提交。

OpenSpec 变更：`stage-one-interactive-furina`、`stage-two-local-expressive-tts`、`stage-three-journey-quality`。见 [第一阶段验收](docs/stage-one-validation.md)、[第二阶段实测](docs/stage-two-validation.md)、[第三阶段验收](docs/stage-three-validation.md)、[交接](docs/handoff.md)。
第四阶段变更 `stage-four-product-entry` 与 [第四阶段验证](docs/stage-four-validation.md) 记录参考导入、普通权限服务管理和新增 review 回归。
