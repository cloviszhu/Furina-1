# 自动记忆控制与手动表达已接合同

## 当前结果

本增量已按edd8b5e的docs/interaction-memory-api-contract.md接线，共同经历tab显示自动记录和原手动记忆两个区块。无需逐条点击保存来形成自动episode。
GET带当前timeline/style、limit50与offset，hasMore提供加载更多，时间/修订版/来源类型可见。自动卡片使用eventId作为opaque操作key，PATCH/DELETE不使用episodeId。纠正失败保留草稿，删除要明确确认；修改成功停止演出并刷新history、manualmemory和自动记录，BroadcastChannel只广播失效标记，另一页重新读取。retained:false显示内容未保留/来源移除，不把它伪称保存成功。
成功聊天后自动刷新记录，不阻塞首句TTS准备。修订期间不会由旧发送结束流程把用户抢回聊天tab。

## 表达兼容

/api/speech emotion仍等于模型段落；manual另发expressionMode:'manual'和referenceEmotion用户选择。读取X-Exo-Emotion和X-Exo-Expression-Mode，确认实际采用值。音频起始时舞台/表达状态按实际值变化。manual响应缺少确认或与所选不同会停止，不伪称采用，不fallback。后台400未登记同样是明确错误，不调用备用TTS。reply模式按注册情况提供段落emotion或省略以使用neutral，最终仍以响应头为准。模型text/emotion及turn/segment身份不被手动表达覆盖。
声音试听保留旧无turn短句路径，声线preferred/effective及恢复未改变。

## 集成记录

在隔离worktree合并edd8b5e，不重复cherry-pick已含的f3bfee5/ca990c3。旧服务端cherry造成5处冲突（turn文档/index/turns/tests），完整采用edd8b5e对应文件解决，merge为4803bd2；未自行修改服务端逻辑。集成owner应核对并只cherry-pick本次末尾前端增量，前置244cddd也需要已有。

## 验证

最终全套Node163/163通过；生命周期/管理控制/记忆UI专项26/26通过。7条隔离Edge回归通过：完整队列、model/TTS取消与刷新、显式收费、声线删除恢复、记忆持久化、纯呈现、安全文本、实际automaticlist/revise/delete、跨页失效、manual响应确认及未登记拒绝。
实际页面新增流程用独立loopback端口、临时SQLite、fake provider/AudioContext/TTS及禁用的Windows凭据bridge；未读取真实key、未访问真实模型/GPU、未影响生产app/TTS。未推main或部署。build和OpenSpec strict通过，既有bundle告警仍存在。

真实角色声线、真实模型回合效果、自然动作感知和长期自然记忆效果仍待统一验收。本次是管理控制与manual表达兼容接线，不代表产品已接近成品。


实际页面视觉复查发现自动区继承flex列表后卡片会被压缩；已改为记忆面板整体滚动，卡片与纠正/删除按钮完整可见。布局修复后自动记忆/原手动记忆两条浏览器流程复跑通过；新增自动区无裁切断言及本地截图。截图仅是假数据+缺失模型占位，不包含真实资产、凭据或用户会话。
