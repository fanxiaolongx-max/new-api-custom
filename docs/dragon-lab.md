# Dragon Lab (DPI Pre-Deploy)

首页 `/` 作为部署演练拓扑工作台。原有 `/dashboard`、远程工作区和虚拟 iBMC 继续使用现有入口。New API 的项目归属和页脚保留在顶部“实验室信息”中，顶部同时保留项目链接。

## 单屏布局

桌面工作台按视口高度自适应，上下两排呈现五个节点，端口映射表和较长详情在自身区域滚动。顶部信息栏在打开页面后展示约 4 秒并自动收起，鼠标停留或键盘焦点在栏内时暂停收起；点击“实验室信息”可重新展开。收起时压缩标题区，不重建远程控制台。窄屏允许横向平移拓扑，极低视口仍可能需要滚动。

## 默认接入

| 节点 | 目标地址 / 用途 | 默认控制台 |
| --- | --- | --- |
| 运维与安装 PC | win7，62.2.90.164，执行 .bat / .ps1 | Guacamole 连接 1，现有 RDP |
| SW1 管理交换机 | eNSP S5700-LSW1，VLANIF 192.168.56.254/24 | Guacamole 连接 7，现有 Telnet；计划的 SSH 不代表已启用 |
| SW2 业务交换机 | eNSP S5700，60.11.40.1 / 62.2.90.x，LACP | Guacamole 连接 8，eNSP TCP 2001；需 eNSP 设备本身返回提示符 |
| iBMC 管理平面 | 出厂 192.168.2.100 → 目标 8.35.155.29 | Guacamole 连接 9 自动登录独立 iBMC SSH 模拟器；“OS 串口”标签使用真实 COM1 |
| TaiShan OS | openEuler，60.11.42.99/19，网关 60.11.40.1 | Guacamole 连接 6，现有 SSH |

这些地址和端口是部署计划，必须按环境实际搭建结果核对。双 10G 是测试目标，页面不会将 VirtualBox 的虚拟网卡速率、LACP 或连通性标成已验证。连线颜色区分管理、业务和 SOL；虚线表示规划，实线表示手工标记已配置，并非实时链路探测结果。VM 运行状态来自已有宿主机代理。

## 拓扑配置

Root 或获授 dragon_lab.full 的管理员可在“配置拓扑”中修改节点地址、网关、远程控制台连接 ID、端口、VLAN 和规划状态。配置通过 `/api/system/lab` 保存到现有 Option 表的 `DragonLabTopology`，兼容项目支持的数据库。保存仅修改展示和控制台绑定，不会配置交换机、修改虚拟机网卡或执行命令。

控制台只能绑定现有 Guacamole PostgreSQL 连接的数字 ID，不支持任意 URL。SW2 或 iBMC SSH 模拟器准备好并注册为现有授权的 Guacamole 连接后，填写其 ID、选择“远程控制台”即可接入。认证和连接权限仍由既有 Guacamole / Dragon API 负责。

默认同时加载已绑定的远程桌面/终端；缩略窗以至少 1280 像素的逻辑宽度渲染远程桌面并按卡片宽度等比缩小，保留鼠标和键盘操作。节点支持页面内大悬浮窗和新标签页，放大/收起沿用同一个 iframe 与会话，暂停画面会卸载这些会话并释放 COM1 租约，恢复时重新连接。暂停不会关机。COM1 使用现有独占会话，其他页面占用时会显示可恢复的忙碌提示；串口只在识别到明确的登录/密码提示后使用服务端保存的 OS 账号提交一次凭据，不会在未知 shell 自动发送回车或重试失败密码。点击终端获取键盘焦点；“发送回车”用于主动唤醒静默串口。VM 关闭时显示状态，不自动开机。

## 脚本工作台

用户提供的 `TaiSha.html` 原样保存在 `service/lab-assets/TaiSha.html`，通过 Go embed 打包。`/api/system/lab/tool` 仅向获得完整 Lab 权限的管理员返回文本，前端在不含 `allow-same-origin` 的隔离 iframe 中打开，支持交互生成和下载原始 HTML。HTML 原有的仿真测试结果不代表真实设备已经通过验收。生成的部署脚本需在 win7 中按实际环境运行；首页不会自动执行脚本或修改设备。

## 权限与检查

实验室配置、地址和嵌入控制台仅向 Root 或获得完整 Lab 权限的管理员展示；匿名与普通用户只看到不含地址的拓扑外壳。接口使用管理员认证及 dragon_lab.full 权限检查，配置写入沿用用户级关键操作限流，所有实验室响应禁用缓存。

相关验证：`service/dragon_lab_test.go`、`web/src/features/dragon-lab/__tests__/dragon-lab.test.tsx`、现有虚拟机/iBMC 前端回归测试、前端类型检查与生产构建。真实端到端部署验收需等实际模拟环境搭建完成。

## 管理终端与串口接入

`tools/lab-console/ibmc-web-console.py` 安装到 openEuler `/usr/local/sbin/`，Guacamole 使用已有 OS SSH 账号执行 `sudo -n ip netns exec ibmc /usr/bin/python3 -I /usr/local/sbin/ibmc-web-console.py`。它在独立网络命名空间内连接模拟器，校验模拟器现有主机密钥并使用其实际管理账号。管理账号与 OS 账号不是同一套；前端不接触两者的密码。此通道不受演练时修改 iBMC IP 的影响。

SW2 的用户服务模板和私网转发器在 `tools/lab-console/`。Docker 私网 `172.19.0.1:12001` 转至 Win7 NAT `127.0.0.1:2001`，先清除半行输入再请求 VRP 提示符，之后原样转发。转发不会启动或伪造 eNSP 设备。若 Win7 本地 2001 端口本身无回显，需先检查 eNSP 的设备运行状态和 CLI 端口。

OS 串口自动登录配置为宿主机 `/var/lib/new-api-vm-agent/serial-login.json`（所有者为代理运行用户、权限 0600），从既有 OS SSH 配置安全复制 username/password。缺失、不安全权限或失败密码不会阻止手工登录。若更新 OS 密码，也应更新该本地配置。

### Connected script workbench

Root administrators can save an HTTP(S) workbench address from the workbench window. Empty restores the bundled isolated generator. External pages retain their own authentication and storage. Closing the floating window keeps its iframe and active tasks alive; opening a new tab detaches the embedded instance. Address changes and detachment are disabled while the remote stop action indicates an active run.

For the six homepage shortcuts, the remote TaiSha page must include:

```html
<script defer src="https://api2.fanxiaolong.uk/dragon-lab-workbench-bridge.js?v=3"></script>
```

The bridge accepts messages only from the exact DragonAPI origin and parent window. The parent validates the remote origin, iframe window and per-load channel. It invokes only the six existing button handlers and mirrors their disabled state and task counters; no credentials or terminal output cross this channel. Shortcuts appear after a valid heartbeat and disappear if the page stops replying. Commands are acknowledged, deduplicated and never automatically retried. Loading the homepage sends handshakes only, never starts a device operation. Saving jump-host passwords remains the remote page's responsibility.

The parent sends its resolved light/dark theme on load and on theme changes. The bridge uses the existing TaiSha theme button only when its current skin differs, preserving the running session. The bridge resource is served with no-store because external workbench pages update independently of the dashboard asset hashes.

### Task progress on shortcut buttons

The connected page must expose `window.TaiShaWorkbench.run(action, { requestId })`, `getSnapshot()` and `subscribe(callback)`. The bridge uses this API directly, never also clicks the original button. It streams a whitelist of task fields, uses the API's request deduplication, and restores the current snapshot on every handshake. Unknown task APIs disable the actions and show an update hint.

The active shortcut displays measured progress, the current stage/target and a final result. Unknown progress shows an activity indicator without a fabricated percentage. Failed or aborted plans exclude skipped checks from the fill when the reported total corresponds to the check list. Failure reasons and retained-terminal counts appear below the buttons. A failed button pulses softly three times; reduced-motion users receive a static indication. Stopping and terminal cleanup remain separate from successful task completion. Lost communications preserve the last observed progress and report an unknown task status rather than a device failure. Stale per-run sequence numbers are ignored, acknowledgements are distinct from completion, and neither timeouts nor reconnects retry device operations automatically.

Lab information is closed on page load. The toolbar button opens it on demand; the compact view and existing project attribution remain available.


## Delegated access

Explicit dragon_lab.full permission grants a non-Root administrator complete Lab use including configuration and factory reset. The frontend lands at / and redirects other app pages there. Existing backend admin permissions remain unchanged. Guacamole uses dragon-lab-<user ID> identities with READ access to configured Lab connections only; logs and VM administration remain Root-only.

The separate `dragon_lab.desktop` permission controls the Debian desktop shortcut in the Lab toolbar. Delegated console users additionally require READ on Guacamole connection 5. User 5 has been granted this separately from full Lab access.

For live execution output, see [terminal feed contract](dragon-lab-terminal-feed.md). Each node defaults to its manual console when idle, automatically switches to its read-only feed when executing, and returns to manual when the task ends. During a run users can choose either tab without being forced back by each output update. Manual sessions open only on first selection and remain mounted across tab changes and in-page expansion. Missing feeds show a waiting/not-connected state rather than another session’s output.
