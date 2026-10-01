# Spec Delta
## Purpose
为用户提供主动按键开启的本地录音输入，把有界音频转换为可编辑文字草稿，保留人工校对和显式发送边界，避免音频泄漏与无意收费调用。
## ADDED Requirements
### Requirement: 本地有界转写
系统 SHALL 只接受固定 captureId 路由的有界二进制音频，并在离线 CPU2threads 下生成草稿；缺失运行时 MUST 明确不可用。
#### Scenario: 转写与拒绝
- **WHEN** 用户提交受支持的30秒内音频，或提交非法 MIME/magic、过大、超长内容
- **THEN** 系统返回草稿或明确错误，不读取客户端路径/URL，不调用外部服务，不写 history/memory/log。
### Requirement: 取消释放资源
系统 MUST 在取消、断连和超时时终止自有解码/识别进程，清理随机临时目录，保持单任务直至资源释放。
#### Scenario: 取消竞态
- **WHEN** 取消早于上传或迟于进程开始
- **THEN** 有界 TTL 取消标记阻止迟到执行，运行任务中止并清理。
### Requirement: 用户拥有草稿与麦克风
系统 SHALL 只在点击录音后请求麦克风；停止/取消/模式切换/销毁关闭 tracks，迟到 permission 同样关闭。转写不得覆盖已编辑草稿，也不得自动发送。
#### Scenario: 编辑或取消后迟到
- **WHEN** 用户编辑草稿或取消后 permission/transcription 才返回
- **THEN** 草稿保留、tracks 关闭、无模型调用。空音频、拒绝授权、缺设备及格式错误明确反馈且可恢复。
### Requirement: Application integration preserves draft isolation
系统 MUST 在既有来源校验后处理ASR路由，录音转写成功仅返回草稿，不自动请求聊天或写入历史/记忆/费用；应用关闭 MUST 停止接收连接并等待ASR取消、子进程close及临时目录清理。
#### Scenario: Completed local draft
- **WHEN** 用户显式停止录音且本地转写成功
- **THEN** 草稿可编辑，音频目录已清空，用户需显式发送才进入聊天，原有记忆与预算不变。
#### Scenario: Full pre-cancel registry
- **WHEN** TTL内已有128个不同预取消ID，又请求登记新的取消ID
- **THEN** 明确429而不丢旧取消，已登记ID仍可更新；60秒到期才释放容量。
#### Scenario: Active cancellation despite full registry
- **WHEN** 128个未知预取消ID仍有效且唯一active任务请求取消
- **THEN** active任务仍可取消并清理，保留1个有界active例外，总最多129；例外占用时拒绝新上传而不驱逐旧ID，TTL释放后恢复。
