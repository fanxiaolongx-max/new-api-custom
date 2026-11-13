# new-api 全渠道模型巡检

通过管理员 `GET /api/channel/test/:id?model=...` 检测每个渠道配置的每个模型。
每次重新分页获取全量渠道，包含手动禁用和自动禁用的渠道，模型不会跨渠道去重。
默认并发 2、每次请求超时 120 秒。Codex 类型渠道使用流式检测。
不调用会自动启停渠道的批量检测接口；单模型检测会更新响应时间并产生测试消费日志，可能产生上游费用。
多密钥渠道由服务选择密钥，本脚本覆盖每个渠道/模型组合，不保证遍历所有密钥。
服务不支持检测的模型或渠道会被记为检测失败，不会当作健康通过。

## 私有配置

在 `~/.config/new-api-channel-monitor/config.json` 创建以下配置（目录权限 700，文件权限 600）：

```json
{
  "base_url": "http://127.0.0.1:3000",
  "admin_pat": "填写具有渠道读取及操作权限的管理员个人访问令牌",
  "workers": 2,
  "timeout_seconds": 120
}
```

也可以通过 `NEW_API_MONITOR_PAT` 环境变量提供 PAT。不要将令牌放进仓库或聊天通知中。
远程地址必须使用 HTTPS；脚本拒绝携带令牌跟随 HTTP 重定向。

```bash
python3 scripts/channel-monitor/monitor.py
python3 -m unittest discover -s scripts/channel-monitor -p 'test_*.py'
```

退出码：0 全部通过，1 存在失败或未配置模型，2 巡检自身失败（含认证失败、渠道枚举不完整、并发运行）。
报告保存在 `~/.local/state/new-api-channel-monitor/latest.json`，上一轮在 `previous.json`。
报告不包含完整渠道对象或密钥，错误文字会做常见凭据脱敏；不要公开原始上游错误。

## 定时和本对话通知

由绑定当前对话的 Codex heartbeat 定时运行脚本，每天 09:00 和 21:00（Africa/Cairo）。
调度由应用管理；本脚本本身不安装 cron，也不直接发送聊天消息。
巡检首次发现异常、异常发生变化、恢复或巡检无法完成时，由当前对话报告；状态不变且无新事项时保持安静。
需要应用和本机巡检环境可用，休眠或离线期间不能保证准时执行。
