<div align="center">

![new-api](/web/public/logo.png)

# New API Custom

🍥 **Next-Generation LLM Gateway, AI Asset Management & DevOps Enhanced System**

<p align="center">
  <a href="./README.zh_CN.md">简体中文</a> |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <strong>English</strong> |
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
  <a href="#-custom-features">Custom Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-model-support">Model Support</a> •
  <a href="#-support">Support</a>
</p>

</div>

---

## 🌟 Custom Features

This project is a customized distribution built on top of [New API](https://github.com/QuantumNous/new-api):

| Module | Description |
|:---|:---|
| 🔐 **Logs Single Sign-On (Logs SSO)** | Built-in Redis Session Bridge connecting New API authentication with container logging (Dozzle). Features `/_logs_auth` gateway proxy verification and `/api/user/auth/logs-sso` jump endpoint, ensuring only root administrators can access real-time microservice logs securely. |
| 💳 **Stripe Subscription Enhancement** | Robust handling of Stripe checkout sessions, invoice updates, and recurring top-up state reconciliations. |
| 🖥️ **Admin Sidebar & Multi-Language** | Native log console shortcut integrated into the admin sidebar, with complete translations across 7 languages (EN, ZH-CN, ZH-TW, JA, FR, RU, VI). |
| ⚡ **Performance & Debounce Optimization** | Debounced search queries on user management pages and hardened session issuance rate limits. |

---

## 📝 Project Description

> [!IMPORTANT]
> - This project is intended solely for lawful and authorized AI API gateway, organization-level authentication, multi-model management, usage analytics, cost accounting, and private deployment scenarios.
> - Users must lawfully obtain upstream API keys, accounts, model services, and interface permissions, and must comply with upstream terms of service and applicable laws and regulations.

---

## 🚀 Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/fanxiaolongx-max/new-api-custom.git
cd new-api-custom

# Edit configuration
nano docker-compose.yml

# Start services
docker-compose up -d
```

<details>
<summary><strong>Using Docker CLI</strong></summary>

```bash
# Build custom image
docker build -t new-api-custom:latest .

# Run with SQLite
docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  new-api-custom:latest

# Run with PostgreSQL / MySQL
docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="postgresql://root:password@postgres:5432/new-api" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  new-api-custom:latest
```

</details>

---

🎉 After deployment, open `http://localhost:3000` in your browser!

---

## ✨ Key Features

### 🎨 Core Capabilities

- 🎨 **Modern UI**: Polished and responsive web console
- 🌍 **Internationalization**: Full support for English, Chinese, French, Japanese, Russian, Vietnamese
- 🔄 **Compatibility**: Fully compatible with One API / New API schema and migration
- 📈 **Analytics**: Real-time traffic, quota consumption, and operational metrics
- 🔒 **Security**: Granular token scopes, IP whitelisting, channel weighting, and session auditing

### 🚀 Supported Interfaces

- ⚡ **OpenAI Responses** & **OpenAI Realtime API** (including Azure)
- ⚡ **Claude Messages API** (with extended thinking mode support)
- ⚡ **Google Gemini Native API** & Gemini 2.0/2.5 Thinking models
- 🔄 **Rerank Endpoints** (Cohere, Jina)
- 🎨 **Midjourney & Suno Music API Proxies**

---

## 💬 Help & Feedback

- 🐛 **Issue Tracker**: [GitHub Issues](https://github.com/fanxiaolongx-max/new-api-custom/issues)
- 💡 **Contributions**: Pull requests and suggestions are welcome!

---

## 📜 License

Licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE).
Built upon [New API](https://github.com/QuantumNous/new-api) and [One API](https://github.com/songquanpeng/one-api).

<div align="center">

<sub>Maintained by <a href="https://github.com/fanxiaolongx-max">fanxiaolongx-max</a></sub>

</div>
