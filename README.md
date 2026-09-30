# Project Exo · 数字芙宁娜

第一阶段可运行：真实 PMX 模型、待机/眨眼/招呼/点头、中文系统 WAV、振幅口型、聊天与可纠正的持久共同经历。

**默认对话是有限规则演示，不是真实 LLM；系统声只是测试备用，不是芙宁娜原声，也不满足最终声线与情绪目标。** 下一阶段优先成熟 TTS，然后完善自然对话与长期成长。

## 本机启动

需要 Node.js 24+，当前使用 24.19.0。Windows 可用已有中文 SAPI，无需管理员安装。

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

打开 **http://127.0.0.1:3000**。服务仅监听本机。Ctrl+C 停止。开发可用 `npm.cmd run dev`，验收用生产构建与 `start`。

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

点击招呼/点头，在设置中试听中文系统声并测试停止。聊天后点击“保存为共同经历”，或手动记录。重启后询问“还记得我们的共同经历吗”，检查引用。纠正/删除会清空旧聊天上下文，防止旧说法回流，其他明确保存的记忆保留。

```powershell
npm.cmd test
npm.cmd run test:browser
```

浏览器测试使用已安装 Edge 与本地资产，先运行服务。无可用 SAPI 时真实语音测试会明确跳过，不能算通过。测试截图在忽略目录 `artifacts/`，包含模型图像，不上传。

## 模型与密钥

设置提供 OpenAI/GPT、GLM、DeepSeek、Claude、Kimi、兼容端点和 Ollama。模型与密钥默认空，切换不发送请求。密钥仅由用户本人填密码框，在页面内存中使用，刷新即清除，不日志、不入 Git、不读取其他文件或应用凭证。

普通聊天不自动调用远程 API。DeepSeek 仅由“一次短测试”按钮启动，本轮最多 3 次、128 输出 token/次、人民币 9 元累计上限，调用前按已核实官方高峰价保守预留。失败不重试，预留持久保留；价格超过 24 小时会拒绝调用。其他远程服务未获费用授权，保持禁用。本阶段真实 API 调用为 0，密钥接入留到用户醒来操作。

共同经历和无密钥预算记录在忽略目录 `data/exo.sqlite`。临时语音文本/WAV 随后清理。素材、声音数据、权重、凭证、运行数据均不提交。

OpenSpec 变更：`stage-one-interactive-furina`。见 [验收记录](docs/stage-one-validation.md)、[下一阶段交接](docs/handoff.md)。
