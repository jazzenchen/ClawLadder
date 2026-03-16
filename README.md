# 🦞 ClawLadder

[OpenClaw](https://github.com/nicepkg/openclaw) 一键安装工具。

全程 UI 操作，无需命令行。

| 安装引导 | 管理面板 |
|:---:|:---:|
| <img src="images/01.welcom.png" width="400" /> | <img src="images/04.dashboard.png" width="400" /> |

## 功能

- **一键安装** — 自动处理 Xcode CLT、Node.js、Git 等依赖，支持国内镜像加速
- **版本锁定** — 安装固定版本的 OpenClaw（当前锁定 `2026.3.13`），避免上游更新导致兼容性问题
- **官方集成** —深度集成 OpenClaw CLI，避免乱改改配置文件导致异常
- **通讯集成** — 向导式配置飞书 / Telegram 机器人，不用手动折腾配对码
- **Skills 推荐** — 内置社区精选 Skills，界面勾选安装，来源可靠
- **全中文引导** — 中文 UI + 关键步骤说明，不熟悉命令行也能跟着走完
- **管理面板** — 装完直接进 Dashboard，网关启停、Token 用量、配置修改都在一个地方

## 安装流程

```
双击运行 - 粘贴模型 API - 粘贴通讯工具配置 - 勾选 Skill - 勾选 Hooks - 完成✅ 
```

## 技术细节（TL;DR）

<details>
<summary><b>技术细节</b></summary>

| | 默认路径（推荐） | Homebrew 路径 |
|---|---|---|
| 权限 | 无需 sudo | 需要管理员密码 |
| Node 来源 | 优先复用系统已有 Node (≥22)，否则独立安装到 `~/.clawladder/node` | 由 Homebrew 管理 |
| 适用场景 | 所有用户 | 已有 Homebrew 环境 |
| 国内镜像 | ✅ npmmirror | — |

安装完成后进入配置引导：
1. **模型配置** — 填写 API Key 或 OAuth 授权，选择默认模型并验证连通性
2. **通讯渠道** — 配置飞书 / Telegram 机器人（可跳过）
3. **Skills** — 从内置技能和 ClawHub 中选择启用
4. **Hooks** — 按需开启 session-memory、boot-md 等
5. **启动网关** — 写入配置，启动 OpenClaw 网关

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 (Rust) |
| 前端 | React 19 + TypeScript + Vite |
| UI 组件 | Tailwind CSS + shadcn/ui |
| 后端 | Rust + Axum + tokio + portable-pty |
| 包管理 | Bun |

### 整体架构

前端通过 HTTP + WebSocket 与本地 Rust 后端通信（默认端口 `3145`）。后端基于 Axum，承担 PTY 管理、OpenClaw CLI 调度、配置读写及网关生命周期控制。

### PTY 桥接

使用 `portable-pty` 在 Rust 侧创建用户登录 shell（`$SHELL -l`），将 stdin/stdout 桥接至前端 xterm.js。每个会话维护独立的 2 MiB 环形滚动缓冲区，支持多 WebSocket 客户端并发接收实时输出。

### PATH 构建

macOS GUI 应用仅继承 launchd 提供的最小 PATH。后端启动时主动拼接 Homebrew、nvm、fnm、volta、asdf、mise、bun、nix、`~/.clawladder/node/bin` 等路径，确保 PTY 环境中可正确定位 `node`、`openclaw` 等可执行文件。

### 安装实现

- **无 sudo 路径**：优先检测系统中已有的 Node.js（含 nvm/fnm/brew 等），版本 ≥ 22 则直接复用；未找到时才下载 LTS 预编译二进制至 `~/.clawladder/node/`。随后执行 `npm install -g openclaw`，将可执行路径追加到 `~/.zshrc`。全程不修改 `/usr/local` 及系统级目录。
- **Homebrew 路径**：调用 app bundle 内置的 `install.sh`，以 `sudo` 执行标准 Homebrew 安装流程。

### 配置管理

所有配置操作均通过 OpenClaw CLI 完成（`openclaw onboard`、`openclaw gateway install/start/stop/restart`）。配置文件 `~/.openclaw/openclaw.json` 采用松散 JSON 结构（`serde_json::Value`），支持 providers、channels、skills、hooks 等字段动态扩展。

### 网关控制

`gateway.rs` 封装了 `openclaw gateway` 的 `status`、`start`、`stop`、`restart`、`install`、`url` 子命令，统一解析 `--json` 输出。网关可注册为系统服务实现后台常驻。

### 日志

运行日志写入 `~/Library/Application Support/com.jazzen.clawladder/logs/`，每次启动生成带时间戳的独立日志文件。安装过程日志存放于 `~/.clawladder/logs/install/`。

### Token 用量统计

扫描 OpenClaw session JSONL 文件，按日期、Agent、Provider、Model 四个维度聚合 token 消耗数据，通过 Dashboard 可视化展示。

</details>

## 相关路径

| 路径 | 用途 |
|---|---|
| `~/.clawladder/node/` | 独立 Node.js 环境（仅在系统无可用 Node ≥ 22 时创建） |
| `~/.clawladder/logs/install/` | 安装日志 |
| `~/.openclaw/openclaw.json` | OpenClaw 配置文件 |
| `~/.openclaw/clawladder.json` | ClawLadder 安装状态 |

## English

See [README_EN.md](README_EN.md) for the English version.