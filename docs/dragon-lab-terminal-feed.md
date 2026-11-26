# TaiSha 执行实况接口约定

在现有 window.TaiShaWorkbench 上增加两个方法，保留原有 run/getSnapshot/subscribe：

```js
getTerminalSnapshot() // 同步返回 { streams: TerminalSnapshot[] }
subscribeTerminals(callback) // 输出或状态变化时通知，返回幂等 unsubscribe
```

控制桥在收到通知后读取快照。不需要新建 HTTP 服务或 SSH/PTY 连接，镜像脚本正在操作的同一个终端。

```js
{ streams: [{
  nodeId: 'os', // pc | sw1 | sw2 | ibmc | os
  sessionId: 'unique-session-id',
  runId: 'existing-task-run-id',
  seq: 25, // 同一个 sessionId/runId 内严格递增
  status: 'running', // running | retained | closed
  text: '最近的已脱敏输出尾部…\n[root@node ~]#',
  redacted: true // 必须经过脱敏才能设置 true
}] }
```

- 最多五个节点，每个节点最多一条流、16000 字符，超长裁切尾部。text 是完整的有界尾部快照，不是增量。重连不会重复拼接。
- 输出或状态变化通知，建议每100–250ms合并推送。新任务清空旧流；结束可保留最终输出，状态 closed。保留终端标为 retained。
- 必须明确映射节点，不按IP猜测。iBMC进入SOL/OS后应把当前执行流映射到os；SW1、SW2、跳板机分别对应sw1、sw2、pc。
- 支持多次订阅和取消，不改变正在运行的设备会话。
- 复用现有脱敏规则，屏蔽密码、令牌、临时链接、认证头；不要返回原始session或配置对象。前端作为纯文本展示，移除ANSI颜色。
- 接口只读，不接收命令。手动终端继续使用现有独立控制台，避免输入干扰自动化PTY。
- DragonAPI缺少接口时显示未接入，不能用任务状态文本冒充真实终端。页面内放大沿用同一视图；首次切换手动终端后保持会话。

可用reach/dryrun验收映射和输出，不要为UI验收执行真实配置或恢复出厂。
