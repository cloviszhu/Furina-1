# 自动记忆控制呈现准备交接

本增量只准备src/natural-memory-controls.js，不猜HTTP接口，不修改server，不挂正式页面。继续feat/speech-turn-lifecycle分支，父线程可只cherry-pick本次增量提交，前置f3bfee5已交集成owner。

## 已实现

NaturalMemoryControls：unconnected/loading/ready/error状态、列表刷新、来源展示、纠正草稿与显式保存、删除确认与取消。待处理mutation锁防重复提交；修改失败保留草稿，删除失败保留卡片。generation和AbortController作废迟到列表与离开页面结果。
mountNaturalMemoryControls：复用memory-card样式；语义按钮、textarea标签与错误alert。正文和来源全部使用textContent，记忆中的HTML不执行。不要求用户逐条保存才能形成自动记忆。

## 内部呈现适配器，非服务端API建议

- list({signal})返回 [{key,text,evidence?:[{label,text}],updatedLabel?}]。
- revise(key,text,{signal})成功resolve，失败reject；key为opaque。
- remove(key,{signal})成功resolve，失败reject。
- onBeforeMutation在明确保存/确认删除后调用，用来取消当前对话/演出。
- onMutation仅成功后调用，用来广播跨页失效、刷新历史和相关计数。

正式API的episode ID、revision、source lineage、响应包裹、分页/筛选、失败与失效约束尚未提供。适配器映射真实合同后才能接到共同经历tab，并应把自动与手动记忆明确区分；此模块不取代既有手动记忆卡片。

## 最小手动表达兼容建议，等待双方确认

建议只扩展/api/speech：现有emotion继续携带段落emotion并严格校验；增加独立referenceEmotion传用户明确的manual参考表达。服务端验证该voice登记后用referenceEmotion合成，WAV响应头返回实际采用值（例如X-Exo-Reference-Emotion，名称待双方确认）。自动模式默认跟随段落；不支持的段落表达可按既有明确neutral策略。manual未登记必须失败，不fallback，不伪称按用户选择。
前端播放开始时字幕跟段落text，舞台表情跟服务端确认的实际参考表达。保留preferred/effective声线、manual设置及取消行为。不改LLM生成emotion或text，不改turn/segment身份或等段约束，无新增收费模型调用。
该字段/响应头仅为供父线程协调的具体建议，未实施、未视为已授权API。待合同明确后前端和服务端分别按所有权接线。

## 验证与剩余工作

6/6 Node状态测试通过；1/1独立Edge呈现流程通过，覆盖来源、纠正失败恢复、删除确认/取消、待处理锁与HTML文本安全。已实际查看本地浏览器截图：卡片、来源折叠与操作按钮可见，沿用既有样式。测试仅随机loopback静态服务器和假回调，无应用API、真实DB、key、模型、TTS或GPU。正式页面/生产服务未修改。
当前未完成：实际list/revise/delete联调、修订/删除对真实检索与跨页取消的影响、共同经历tab挂载、手动表达新合同接线。不能宣称自动记忆控制已可在正式页面使用。

