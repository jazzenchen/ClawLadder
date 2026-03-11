# 🦞 ClawLadder

Desktop installer for ClawLadder, built with Tauri + React. Provides a GUI for one-click ClawLadder installation.

## Tech Stack

- Tauri 2 (Rust) — Desktop shell
- React 19 + TypeScript — Frontend UI
- Vite — Frontend build
- Bun — Package management & script runner
- Tailwind CSS + shadcn/ui — Styling & components

## Project Structure

```
src/
├── core/       # Rust core library (PTY, session management, logging)
├── server/     # Rust HTTP server (installation API)
├── desktop/    # Tauri desktop app
└── web/        # React frontend
```

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/)
- Xcode Command Line Tools (`xcode-select --install`)

### Install Dependencies

```bash
cd src
bun install
```

### Dev Mode

```bash
# Web only (frontend)
cd src && bun run web:dev

# Desktop app
cd src && bun run desktop:dev

# Server only
cd src && bun run server:dev
```

### Production Build

```bash
cd src && bun run build
```

The build script auto-increments the version number, builds the app, packages a DMG, signs and notarizes it.

Apple signing credentials must be configured in `src/apple-sign.config` (gitignored, never committed). See `src/apple-sign.config.example` for the template.

## macOS Installation Issues

If you see "damaged and can't be opened" or "can't verify the developer" when launching the app, run:

```bash
sudo xattr -r -d com.apple.quarantine /Applications/ClawLadder.app
```

This is a macOS Gatekeeper restriction for apps distributed outside the App Store. Removing the quarantine attribute allows the app to open normally.

## License

Private
