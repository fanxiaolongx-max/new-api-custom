<div align="center">

![new-api](/web/public/logo.png)

# New API Custom

🍥 **基于 New API 的大模型网关、AI 资产管理与运维增强系统**

<p align="center">
  简体中文 |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <a href="./README.md">English</a> |
  <a href="./README.fr.md">Français</a> |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/fanxiaolongx-max/new-api-custom/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/fanxiaolongx-max/new-api-custom?color=brightgreen" alt="license">
  </a>
  <a href="https://github.com/fanxiaolongx-max/new-api-custom/stargazers">
    <img src="https://img.shields.io/github/stars/fanxiaolongx-max/new-api-custom?style=flat-square" alt="stars">
  </a>
  <a href="https://github.com/fanxiaolongx-max/new-api-custom/network/members">
    <img src="https://img.shields.io/github/forks/fanxiaolongx-max/new-api-custom?style=flat-square" alt="forks">
  </a>
  <a href="https://github.com/fanxiaolongx-max/new-api-custom/issues">
    <img src="https://img.shields.io/github/issues/fanxiaolongx-max/new-api-custom?style=flat-square" alt="issues">
  </a>
</p>

<p align="center">
  <a href="#-本次定制增强特性">定制特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-主要特性">主要特性</a> •
  <a href="#-部署">部署</a> •
  <a href="#-文档">文档</a> •
  <a href="#-帮助支持">帮助</a>
</p>

</div>

---

## 🌟 本次定制增强特性

本项目在开源 [New API](https://github.com/QuantumNous/new-api) 基础上进行了二次开发与运维增强：

| 模块 | 特性说明 |
|:---|:---|
| 🔐 **日志单点登录 (Logs SSO)** | 原生集成基于 Redis Session Bridge 的 Dozzle / 容器日志免密 SSO，提供 `/_logs_auth` 网关拦截与 `/api/user/auth/logs-sso` 鉴权跳板，确保仅管理员（RootUser）可安全查看实时微服务日志。 |
| 💳 **Stripe 订阅与支付增强** | 重构与加固 Stripe 订阅支付回调链路，优化充值金额清空逻辑与并发状态结算。 |
| 🖥️ **管理端侧边栏与体验升级** | 侧边栏原生集成日志控制台导航入口，全面补全简中、繁中、英语、法语、日语、俄语、越南语 7 种语言词条。 |
| ⚡ **性能与防抖优化** | 优化管理端用户列表防抖检索与高并发会话签发限流审计。 |

---

## 📝 项目说明

> [!IMPORTANT]
> - 本项目仅面向合法授权的 AI API 网关、组织内部鉴权、多模型管理、用量统计、成本核算和私有化部署场景。
> - 使用者必须合法取得上游 API Key、账号、模型服务或接口权限，并遵守上游服务条款及适用法律法规。
> - 使用者应确保其使用方式符合上游服务条款及适用法律法规。
> - 面向公众提供生成式人工智能服务时，使用者应遵守监管要求，自行完成所在司法辖区要求的备案、许可、内容安全、实名、日志留存、税务和上游授权等合规义务。

---

## 🚀 快速开始

### 使用 Docker Compose（推荐）

```bash
# 克隆项目
git clone https://github.com/fanxiaolongx-max/new-api-custom.git
cd new-api-custom

# 编辑 docker-compose.yml 配置
nano docker-compose.yml

# 启动服务
docker-compose up -d
```

<details>
<summary><strong>使用 Docker 命令</strong></summary>

```bash
# 本地构建镜像
docker build -t new-api-custom:latest .

# 使用 SQLite 启动
docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  new-api-custom:latest

# 使用 PostgreSQL / MySQL
docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="postgresql://root:password@postgres:5432/new-api" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  new-api-custom:latest
```

> **💡 提示：** `-v ./data:/data` 会将数据保存在当前目录的 `data` 文件夹中，生产环境建议配合 PostgreSQL 与 Redis 运行。

</details>

---

🎉 部署完成后，访问 `http://localhost:3000` 即可使用！

---

## ✨ 主要特性

### 🎨 核心功能

| 特性 | 说明 |
|------|------|
| 🎨 全新 UI | 现代化的用户界面设计与交互体验 |
| 🌍 多语言 | 支持中文、英文、法语、日语、繁体、俄语、越南语 |
| 🔄 数据兼容 | 完全兼容原版 One API / New API 数据库 |
| 📈 数据看板 | 可视化控制台、用量统计与性能指标监控 |
| 🔒 权限管理 | 令牌分组、渠道权重、模型限制、会话审计 |

### 💰 授权用量与成本管理

- ✅ 合法授权场景下的内部充值与额度分配（易支付、Stripe 等）
- ✅ 组织内按次、按量或缓存命中成本核算
- ✅ 支持 OpenAI、Azure、DeepSeek、Claude、Qwen 等模型的缓存计费统计
- ✅ 面向内部管理或企业客户的灵活计费与倍率配置策略

### 🔐 授权与安全

- 😈 Discord 授权登录
- 🤖 LinuxDO 授权登录
- 📱 Telegram 授权登录
- 🔑 OIDC 统一认证与 Passkey 支持
- 🔍 Key 查询使用额度

### 🚀 高级功能

**API 格式支持：**
- ⚡ OpenAI Responses & OpenAI Realtime API（含 Azure）
- ⚡ Claude Messages 格式
- ⚡ Google Gemini 原生格式与 Thinking 模型
- 🔄 Rerank 模型（Cohere、Jina）

**智能路由与格式转换：**
- ⚖️ 渠道加权随机与自动故障重试
- 🚦 用户/令牌级别模型限流与并发控制
- 🔄 OpenAI Compatible ⇄ Claude Messages 互转
- 🔄 OpenAI Compatible → Google Gemini 互转

---

## 🤖 模型支持

| 模型类型 | 说明 |
|:---|:---|
| 🤖 OpenAI-Compatible | OpenAI 标准兼容模型 |
| 🤖 OpenAI Responses | OpenAI Responses 新规范 |
| 🎨 Midjourney-Proxy | Midjourney 绘图接口代理 |
| 🎵 Suno-API | Suno 音乐生成接口支持 |
| 🔄 Rerank | Cohere、Jina 等重排序模型 |
| 💬 Claude | Claude 3 / 3.5 / 3.7 全系列（含 Thinking 思考模式） |
| 🌐 Gemini | Google Gemini 2.0 / 2.5 系列 |

---

## ⚙️ 环境变量配置

<details>
<summary>常用环境变量配置列表</summary>

| 变量名 | 说明 | 默认值 |
|:---|:---|:---|
| `SESSION_SECRET` | 鉴权签名密钥；多节点集群必须保持一致 | - |
| `SESSION_COOKIE_SECURE` | 是否启用 Secure Cookie 与严格 Origin 校验 | `false` |
| `SESSION_COOKIE_TRUSTED_URL` | 允许调用 refresh/logout 的精确 HTTPS Origin | - |
| `SQL_DSN` | 数据库连接字符串（PostgreSQL / MySQL / SQLite） | - |
| `REDIS_CONN_STRING` | Redis 连接字符串（Session 与缓存支持） | - |
| `STREAMING_TIMEOUT` | 流式超时时间（秒） | `300` |
| `MAX_REQUEST_BODY_MB` | 请求体最大大小（MB） | `32` |

</details>

---

## 💬 帮助与反馈

- 🐛 **问题反馈**：[Issues](https://github.com/fanxiaolongx-max/new-api-custom/issues)
- 💡 **分支合并**：欢迎提交 Pull Request 完善定制功能。

---

## 📜 许可证

本项目采用 [GNU Affero 通用公共许可证 v3.0 (AGPLv3)](./LICENSE) 授权。
基于 [New API](https://github.com/QuantumNous/new-api) 与 [One API](https://github.com/songquanpeng/one-api) 进行二次开发。

<div align="center">

<sub>Maintained by <a href="https://github.com/fanxiaolongx-max">fanxiaolongx-max</a></sub>

</div>
