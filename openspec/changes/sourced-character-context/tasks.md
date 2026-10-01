# Tasks

## 1. 来源与小包

- [x] 1.1 逐条登记原始 URL、locator、sourceStatus 与有限编辑时间映射；通过默认包来源审计测试，pending 不进入 prompt。

## 2. Resolver

- [x] 2.1 实现 edition/timeline/perspective 与知情过滤；用明确 synthetic 边界测试验证未来/私密/后发布旧事。
- [x] 2.2 实现 topic/entity/alias 排序、三类隔离及共享预算；测试稳定顺序、用户冲突/计划/推测及模型投影。

## 3. 验证与交接

- [x] 3.1 专属 Node tests、可独立运行的既有检查与 OpenSpec strict 验证，记录实际结果与跳过理由。
- [x] 3.2 写 schema/interface、真实 enabled/pending 数与 adapter 限制交接；核对只新增授权文件后独立提交。
