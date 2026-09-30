# 日常使用核查与价格时间维护

## 有界 UX 调查（只调查，未改行为）

在独立 Chromium context、随机端口 `58526`、临时 SQLite 上，使用同一个 mock 已保存凭据状态、两条 mock 声线和一条 fixture 历史/记忆重复操作，11/11 场景通过。没有读取用户浏览器 storage 或真实 key；没有访问生产 app/TTS；网络限制为独立端口；只发 fixture GET，凭据 read/save/delete 0、模型 0、合成 0、预算调用 0。脚本和完整 fixture 快照保存在本机忽略目录 `artifacts/daily-ux-investigation/`。

| 重复流程 | 观察 |
| --- | --- |
| 新 profile，后台 mock 凭据已保存 | 状态“已保存”，来源 `input`，选中列表第一条 RAVDESS fixture |
| 在 127.0.0.1 手动选 saved、Furina fixture、calm、1.2 倍速后重开 | 来源和声线/普通设置保留，不是每次打开必定丢失 |
| 同一 profile 换 localhost | 普通设置恢复该来源默认：offline、input、RAVDESS；后台凭据状态、历史和记忆仍相同 |
| 再回 127.0.0.1 | 原 saved/Furina 偏好仍在，各来源独立，不是服务端删除 |
| 更换 provider 再回 DeepSeek | handler 明确重置来源为 input、清空模型，状态仍可为“已保存” |
| 点击 DeepSeek 推荐按钮 | 保留已选 saved 来源，只应用用户点击的模型/endpoint 建议 |
| v1 fixture 设置缺少 credentialSource | 迁移保持声线等字段，来源按默认 input；手动选择 saved 后同来源可保留 |
| 偏好声线暂时缺席后恢复 | 回退到列表第一条神经声线并写入设置；恢复原声线后仍停留回退声线 |
| 新建独立 profile 再打开同地址 | 独立 storage 导致 input/默认声线，即使后台凭据已保存 |

原因位置：`src/settings.js` 的来源默认/版本迁移；`src/main.js` 的 localStorage 偏好、provider onchange 重置、credential status 只更新文字、voices 缺失偏好时回退及 boot 持久化。来源的 host/port 与 profile 均会划分普通设置。用户实际截图里的 saved 状态 + input 来源 + RAVDESS 与上述多种路径相容；没有读取他的环境，不能认定唯一根因。

最小修正建议（本次未实现）：

1. 统一入口指向 `http://127.0.0.1:3000`；localhost 显示“偏好按地址分别保存”和显式切换入口。避免自动迁移 storage 或重定向用户正在聊天的页面。
2. 状态已保存但来源 input 时，提供明确的“本页使用已保存密钥（不测试）”按钮，点击后只保存来源 enum，仍需本人启用真实模式及逐次发送；区分“凭据存在”和“本页选用”。不自动读取 key、不自动切来源。
3. 声线临时不可用时显示所选声线缺失及回退状态，保留用户首选 ID，等待显式更换后再覆盖首选；不要把临时回退当成用户偏好。

## 官方价格核验与最小维护

并行核价时间为 **2026-09-30T21:53:53Z**，本轮再次打开官方 [中文价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/?article_id=article_1779470751466_8) 与 [英文价格页](https://api-docs.deepseek.com/quick_start/pricing/) 交叉确认。中文表显示 CNY/百万 tokens：Flash 峰值 cache-miss 输入 2、输出 8、cache-hit 0.04；Pro 峰值输入 9、输出 27。平峰为峰值一半；英文页面是 USD，不能当作 CNY 常数。继续按峰值及全输入 cache-miss 保守计算。

运行时代码只更新 `server/budget.js` 的 `verifiedAt` 从 10:15:00Z 到 **21:53:53Z**。价格常数、9 元累计上限、128 output token/16000 输入 bytes、10 倍预留、失败留存、无自动 retry 均不变；不重算旧 reserve。24 小时失效机制仍在，截止 **2026-10-01T21:53:53Z**，之后必须重新官方核价。

新增隔离边界测试以旧时间创建 completed/failed 台账，再应用新价格时间，证明 records/reserve/剩余额度/上限原样保留；验证生效前、起点、24 小时前最后 1 ms、恰满 24 小时的有效性和阻断，阻断不添加台账。`npm.cmd test` **108/108** 通过；`npm.cmd run build:review` 通过（现有 >500 kB 警告），审查 HTML/JS/CSS 与现有生产包 hash 一致，无前端行为改动。本机日志及前后审计位于 `artifacts/pricing-maintenance/`；维护前运行时代码归档为 `runtime-before.tar`，无需恢复数据库。部署结果完成后补充。

## 用户剩余验收（仍需本人明确操作）

- 固定入口和同一 profile，自行刷新并确认默认演示；确认来源/模型/声线，手动选已保存来源，无需再录 key 或设置内反复短测。
- 明确启用真实聊天，逐次发送少量普通问题；检查结构、自然表达、收费模式显示、失败/取消提示。确认刷新不自动启用或发送，不把取消当作免计费承诺。
- 显式试听选定真实声线，判断音色/可懂度/情绪；开启自动朗读后完成一轮真实模型到音频的衔接，操作停止。mock 取消链路已测，真实听感尚未验收。
- 保存一条用户消息为记忆，核对来源，刷新/重开再询问；检查未知经历不被否定、约定不冒充已发生、没有无据“又缺席”或感官补写。已有真实召回成功证据不重跑收费测试，新提示服从性尚未实测。
- 修改/删除本人选择的记忆，确认界面与后续召回不继续使用旧内容；此生命周期已有隔离测试，用户可按需少量验收。
