# 🦞 ClawLadder

ClawLadder 的桌面安装器，基于 Tauri + React 构建。提供图形化界面一键安装 ClawLadder。

## 技术栈

- Tauri 2 (Rust) — 桌面壳
- React 19 + TypeScript — 前端 UI
- Vite — 前端构建
- Bun — 包管理 & 脚本运行
- Tailwind CSS + shadcn/ui — 样式组件

## 项目结构

```
src/
├── core/       # Rust 核心库 (PTY、会话管理、日志)
├── server/     # Rust HTTP 服务端 (安装 API)
├── desktop/    # Tauri 桌面应用
└── web/        # React 前端
```

## 开发

### 前置要求

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/)
- Xcode Command Line Tools (`xcode-select --install`)

### 安装依赖

```bash
cd src
bun install
```

### 开发模式

```bash
# Web 开发 (仅前端)
cd src && bun run web:dev

# 桌面应用开发
cd src && bun run desktop:dev

# 仅后端服务
cd src && bun run server:dev
```

### 构建发布版本

```bash
cd src && bun run build
```

构建脚本会自动递增版本号、构建应用、打包 DMG、签名并公证。

需要在 `src/apple-sign.config` 中配置 Apple 签名凭据（该文件已被 gitignore，不会提交）。

## macOS 安装问题

如果打开应用时遇到 "已损坏，无法打开" 或 "无法验证开发者" 的提示，运行：

```bash
sudo xattr -r -d com.apple.quarantine /Applications/ClawLadder.app
```

这是 macOS Gatekeeper 对非 App Store 应用的限制，移除隔离属性后即可正常打开。

## 许可证

Private
