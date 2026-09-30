# 独立记忆 QA 修复交接

日期：2026-09-30。基线：`17efdee94e43e0f07bb0f09196f5a6870e5440f9`。

分支：`qa-memory-context-20260930`。
独立 worktree：`C:/Users/zhu06/AppData/Local/Temp/Project-Exo-memory-qa-20260930`。
本文件与修复同一提交；精确提交号由 `git rev-parse qa-memory-context-20260930` 获取。

## 修复结果

1. **P1：记忆变更期间的旧回复。** `MemoryStore` 在成功提交修改/删除后递增上下文 generation；失败操作不递增。`/api/chat` 在捕获记忆和历史时保存 generation，provider 返回或失败回退后、写入事件前再检查。不一致返回 `409 CONTEXT_CHANGED`，不写入 user/assistant 事件，不返回旧回复或 recalled 内容，也不自动重试。generation 为单服务进程内状态，不需要数据库迁移，重启不存在跨进程存活的 in-flight 请求。既有清历史和共享 source 的其他已确认记忆保留逻辑继续生效。
2. **P2：近似匹配虚假肯定。** 词汇相似命中标注为 related；演示模式引用“可能相关的记录”，明确无法确认问题中的其他细节，取消无条件“当然”。provider 系统提示也说明匹配不能确认地点、日期或其他前提。保留相关检索，未实现语义地点/日期解析，不声称真实 LLM 行为已验证。
3. **P2：过期聊天来源无法保存。** 修改/删除开始即取消当前语音、失效本页 pending 回复、清除已选来源与旧草稿；刷新历史及保存前重新校验 source。增加“改为手动记录（不关联聊天）”按钮，显式脱离来源时保留用户当前文字。失效来源不会自动降级并重新保存旧内容；用户需重新选择消息或主动填写手动记录。旧聊天 200 及旧历史/记忆 GET 快照迟到也被页面 generation 拦截。

## 验证证据

- Node `v24.19.0`，正规 npm registry 安装锁定依赖：`npm ci --ignore-scripts --registry=https://registry.npmjs.org`；锁文件没有变更。
- `npm test`：**26 tests / 26 pass / 0 fail / 0 skipped**。
- `tests/memory-context.test.js`：8 项新回归。PATCH/DELETE × provider 成功/失败，每组同时挂起直接召回和仅使用历史的两个 mock 请求；检验 409、无旧回复/recall、历史为空、同 source 其他记忆存活和新聊天正常。另检验失败变更不递增 generation，以及地点、数字日期、星期冲突。
- `tests/memory-ui.test.js`：7 项新回归。在 Node VM 中执行真实 `src/main.js`，仅替换 import 的渲染/语音依赖和网络、提供小型 DOM 替身。检验真实按钮事件、PATCH/DELETE 清源、停止语音、旧 200 不展示不发声、保存前重验、手动恢复、有效 source 保留，以及过时历史/记忆快照丢弃。
- `npm run build`：成功，16 modules transformed；保留约 735.52 kB 的 Three.js bundle 大小提示，不属于本次修复范围。
- `git diff --check`：通过。

所有 provider 测试均为注入的 mock，无真实 LLM/付费调用；仅协议 HTTP 测试临时监听 `127.0.0.1` 自动分配端口。未运行浏览器渲染、真实语音或用户资产测试。UI 验证为单元验证，不声称浏览器端到端验收。

## 集成注意

没有修改主工作树、主服务、TTS 分支或用户素材；未读取凭证文件、未 push、未合并。适用 OpenSpec 的 shared-memory/local-conversation 设计和要求已读取，保留默认 mock/demonstration 标记和原预算限制。

TTS 任务同时修改 `server/index.js`、`src/main.js`、`index.html`，集成时可能需要人工处理同文件冲突。保留服务端 generation 检查在所有 provider 成功/失败路径结束后、事件持久化之前；保留前端检查在展示回复和调用任何语音后端之前，记忆变更入口须继续停止 TTS。请在集成后的代码再跑完整单元测试及构建；本分支不替另一任务做合并。

本页 generation 针对本页发起的变更；没有增加跨标签页实时广播。服务端会失效处理中的旧上下文回复，保存入口会重验其他标签页清掉的来源；已经在其他标签页展示/播放的既有内容不属于实时同步能力。

无剩余修复阻塞。独立 worktree 保留供评审与集成。
