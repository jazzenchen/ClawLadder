use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use clawladder_core::config;
use clawladder_core::gateway;
use clawladder_core::logger::Logger;
use clawladder_core::pty;
use clawladder_core::session::*;
use clawladder_core::usage;
use serde::Deserialize;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::services::ServeDir;

#[derive(Clone)]
struct AppState {
    registry: Registry,
    install_script: PathBuf,
    logger: Logger,
}

pub async fn run_server(port: u16, dist_dir: PathBuf, logger: Logger) {
    let install_script = find_install_script();
    tracing::info!(path = %install_script.display(), "Install script located");

    let state = AppState {
        registry: Arc::new(dashmap::DashMap::new()),
        install_script,
        logger,
    };

    let app = Router::new()
        .route("/api/sessions", get(list_sessions).post(create_session))
        .route("/api/sessions/{id}", delete(delete_session))
        .route("/api/sudo/validate", post(sudo_validate))
        .route("/api/install", post(start_install))
        .route("/api/status", get(check_status))
        // Config endpoints
        .route("/api/config", get(get_config).post(save_config))
        .route("/api/config/set", post(config_set_handler))
        // ClawLadder status
        .route("/api/clawladder/status", post(set_clawladder_status))
        // Models / Providers
        .route("/api/models/providers", get(list_providers_handler))
        .route("/api/models/list", get(list_models_handler))
        // Gateway control endpoints
        .route("/api/gateway/status", get(get_gateway_status))
        .route("/api/gateway/url", get(get_gateway_url))
        .route("/api/gateway/install", post(gateway_install_handler))
        .route("/api/gateway/start", post(gateway_start_handler))
        .route("/api/gateway/restart", post(gateway_restart_handler))
        .route("/api/gateway/stop", post(gateway_stop_handler))
        .route("/api/gateway/uninstall", post(gateway_uninstall_handler))
        .route("/api/gateway/open-dashboard", post(gateway_open_dashboard_handler))
        // Onboarding: run `openclaw onboard` with flags
        .route("/api/onboard", post(run_onboard_handler))
        // Doctor
        .route("/api/doctor", post(run_doctor_handler))
        // OpenClaw status (token usage, sessions, agents)
        .route("/api/openclaw/status", get(openclaw_status_handler))
        // Skills & Hooks
        .route("/api/skills/list", get(list_skills_handler))
        .route("/api/hooks/list", get(list_hooks_handler))
        .route("/api/hooks/enable", post(hook_enable_handler))
        .route("/api/hooks/disable", post(hook_disable_handler))
        // ClawHub
        .route("/api/clawhub/status", get(clawhub_status_handler))
        .route("/api/clawhub/install", post(clawhub_install_handler))
        .route("/api/clawhub/skill-install", post(clawhub_skill_install_handler))
        .route("/api/clawhub/skill-uninstall", post(clawhub_skill_uninstall_handler))
        // Auth: OAuth / plugin login
        .route("/api/models/auth/login", post(models_auth_login_handler))
        .route("/api/models/auth/status", get(models_auth_status_handler))
        .route("/api/plugins/enable", post(plugins_enable_handler))
        // Device info
        .route("/api/device/serial", get(device_serial_handler))
        // Usage stats (JSONL scan)
        .route("/api/usage", get(usage_stats_handler))
        // WebSocket
        .route("/ws", get(ws_handler))
        .with_state(state)
        .fallback_service(
            ServeDir::new(&dist_dir).append_index_html_on_directories(true),
        );

    let addr = format!("127.0.0.1:{}", port);
    tracing::info!(addr = %addr, "Server running");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn find_install_script() -> PathBuf {
    // Inside .app bundle: Contents/Resources/clawladder/install.sh
    if let Ok(exe) = std::env::current_exe() {
        if let Some(macos_dir) = exe.parent() {
            let resources = macos_dir.join("../Resources/clawladder/install.sh");
            if resources.exists() {
                return resources;
            }
        }
    }
    // Fallback for dev
    let candidates = [
        PathBuf::from("clawladder/install.sh"),
        PathBuf::from("../clawladder/install.sh"),
        PathBuf::from("../../clawladder/install.sh"),
    ];
    for p in &candidates {
        if p.exists() {
            return std::fs::canonicalize(p).unwrap_or_else(|_| p.clone());
        }
    }
    PathBuf::from("clawladder/install.sh")
}

// --- Sudo validation ---

#[derive(Deserialize)]
struct SudoRequest {
    password: String,
}

async fn sudo_validate(
    Json(body): Json<SudoRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    tracing::info!("Sudo validation requested");
    let password = body.password;
    let result = tokio::task::spawn_blocking(move || {
        use std::process::{Command, Stdio};
        let mut child = Command::new("sudo")
            .args(["-S", "-v"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn sudo: {}", e))?;

        if let Some(ref mut stdin) = child.stdin {
            let _ = stdin.write_all(password.as_bytes());
            let _ = stdin.write_all(b"\n");
        }

        let status = child.wait().map_err(|e| format!("sudo wait failed: {}", e))?;
        Ok::<bool, String>(status.success())
    })
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Sudo validation task join error");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Task join error: {}", e) })),
        )
    })?
    .map_err(|e| {
        tracing::error!(error = %e, "Sudo validation spawn error");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
    })?;

    if result {
        tracing::info!("Sudo validation succeeded");
        Ok(Json(serde_json::json!({ "valid": true })))
    } else {
        tracing::warn!("Sudo validation failed — invalid password");
        Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "valid": false, "error": "Invalid password" })),
        ))
    }
}

/// Return the device serial number (macOS: IOPlatformSerialNumber, Linux: /etc/machine-id).
async fn device_serial_handler() -> Json<serde_json::Value> {
    let (serial, hardware_uuid) = tokio::task::spawn_blocking(|| {
        let serial = get_macos_serial().unwrap_or_default();
        let uuid = get_macos_hardware_uuid().unwrap_or_default();
        (serial, uuid)
    })
    .await
    .unwrap_or_default();

    Json(serde_json::json!({
        "serial": serial,
        "hardwareUUID": hardware_uuid,
    }))
}

fn get_macos_serial() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-l"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("IOPlatformSerialNumber") {
            // Format: "IOPlatformSerialNumber" = "XXXX"
            return line.split('"').nth(3).map(|s| s.to_string());
        }
    }
    None
}

fn get_macos_hardware_uuid() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-d2", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("IOPlatformUUID") {
            return line.split('"').nth(3).map(|s| s.to_string());
        }
    }
    None
}

/// Check if ClawLadder is installed and/or running.
async fn check_status() -> Json<serde_json::Value> {
    let (installed, version) = tokio::task::spawn_blocking(|| {
        // 1. Try the resolved binary path (saved or probed via $SHELL)
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let shell = clawladder_core::path_utils::user_shell();
        let cmd_str = format!("{} --version", bin);
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(o) if o.status.success() => {
                let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
                (true, Some(ver))
            }
            _ => (false, None),
        }
    })
    .await
    .unwrap_or((false, None));

    // Check if openclaw.json exists (= configured)
    let configured = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let openclaw_config = format!("{}/.openclaw/openclaw.json", home);
        std::fs::metadata(&openclaw_config).is_ok()
    })
    .await
    .unwrap_or(false);

    let running = tokio::task::spawn_blocking(|| {
        std::process::Command::new("pgrep")
            .args(["-f", "openclaw"])
            .stdout(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false);

    tracing::info!(installed = installed, configured = configured, running = running, "Status check");
    Json(serde_json::json!({
        "installed": installed,
        "version": version,
        "configured": configured,
        "running": running,
    }))
}

// --- Install endpoint ---

#[derive(Deserialize)]
struct InstallRequest {
    #[serde(default)]
    password: String,
    #[serde(default)]
    verbose: bool,
    /// When true, use Homebrew path (install.sh, requires sudo).
    /// When false (default), use nvm path (no sudo needed).
    #[serde(default)]
    use_homebrew: bool,
    /// When true, use China mirrors for nvm/npm/node downloads.
    #[serde(default)]
    use_china_mirror: bool,
}

async fn start_install(
    State(state): State<AppState>,
    Json(body): Json<InstallRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if body.use_homebrew {
        start_install_homebrew(state, body).await
    } else {
        start_install_nvm(state, body).await
    }
}

/// Homebrew path: uses install.sh with sudo (existing logic).
async fn start_install_homebrew(
    state: AppState,
    body: InstallRequest,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Install requested (Homebrew path)");
    let script_path = state.install_script.clone();
    if !script_path.exists() {
        tracing::error!(path = %script_path.display(), "Install script not found");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Install script not found: {}", script_path.display()),
        ));
    }

    // Create a temporary askpass script that outputs the password.
    let askpass_dir = std::env::temp_dir();
    let askpass_path = askpass_dir.join(format!("clawladder-askpass-{}", std::process::id()));
    let askpass_content = format!("#!/bin/bash\nprintf '%s\\n' {}\n", shell_escape(&body.password));
    std::fs::write(&askpass_path, &askpass_content).map_err(|e| {
        tracing::error!(error = %e, "Failed to write askpass script");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write askpass: {}", e))
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&askpass_path, std::fs::Permissions::from_mode(0o700));
    }

    let script_str = script_path.to_string_lossy().to_string();
    let askpass_str = askpass_path.to_string_lossy().to_string();
    let verbose_env = if body.verbose { " OPENCLAW_VERBOSE=1" } else { "" };
    let cmd = format!(
        "export SUDO_ASKPASS={} NONINTERACTIVE=1{} && sudo -A -v && bash {} --no-prompt --npm --no-onboard; OPENCLAW_BIN=\"$(which openclaw 2>/dev/null)\"; echo \"OPENCLAW_BIN=$OPENCLAW_BIN\"; rm -f {}",
        shell_escape(&askpass_str),
        verbose_env,
        shell_escape(&script_str),
        shell_escape(&askpass_str),
    );

    let session_id = spawn_install_session(&state, &cmd, true).await?;
    Ok(Json(serde_json::json!({ "session_id": session_id.to_string() })))
}

/// NVM path: install nvm → Node → npm install -g openclaw. No sudo needed.
/// This path deliberately avoids install.sh because install.sh may try to
/// install Homebrew (which requires sudo), defeating the purpose of the
/// no-sudo nvm path.
async fn start_install_nvm(
    state: AppState,
    body: InstallRequest,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Install requested (standalone node path, china_mirror={})", body.use_china_mirror);
    let verbose_flag = if body.verbose { "set -x && " } else { "" };

    let node_index_url = if body.use_china_mirror {
        "https://npmmirror.com/mirrors/node/index.json"
    } else {
        "https://nodejs.org/dist/index.json"
    };

    let node_dist_base = if body.use_china_mirror {
        "https://npmmirror.com/mirrors/node"
    } else {
        "https://nodejs.org/dist"
    };

    let npm_mirror_cmd = if body.use_china_mirror {
        r#"
echo "==> 设置 npm 国内镜像..."
npm config set registry https://registry.npmmirror.com
"#
    } else {
        ""
    };

    let cmd = format!(
        r##"{verbose}
set -e

NODE_MIN_MAJOR=22
NODE_DIR="$HOME/.clawladder/node"

# ---------------------------------------------------------------
# Step 0: Ensure Xcode Command Line Tools + git (macOS only)
# ---------------------------------------------------------------
# Uses the same approach as Homebrew's install.sh — proven on 10.9–15.x
if [ "$(uname -s)" = "Darwin" ]; then
  if ! xcode-select -p &>/dev/null; then
    echo "==> 安装 Xcode Command Line Tools（纯命令行，无弹窗）..."
    # This placeholder file makes softwareupdate list CLT as available
    touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress

    # Use Homebrew's proven label-extraction logic (works on macOS 10.9–15.x)
    CLT_LABEL=$(softwareupdate -l 2>/dev/null \
      | grep -B 1 -E 'Command Line Tools' \
      | awk -F'*' '/^\s*\*/ {{print $2}}' \
      | sed -e 's/^ *Label: //' -e 's/^ *//' \
      | sort -V \
      | tail -n1)

    if [ -n "$CLT_LABEL" ]; then
      echo "==> 找到: $CLT_LABEL"
      echo "==> 正在安装（约 5-10 分钟）..."
      softwareupdate --verbose --install "$CLT_LABEL" 2>&1
    else
      echo "==> softwareupdate 未列出 CLT，尝试 xcode-select 触发..."
      xcode-select --install 2>/dev/null || true
      # Wait for user/system to complete the install
      echo "==> 等待 Xcode CLT 安装完成..."
      WAITED=0
      while [ $WAITED -lt 600 ]; do
        if xcode-select -p &>/dev/null; then break; fi
        sleep 5
        WAITED=$((WAITED + 5))
        if [ $((WAITED % 30)) -eq 0 ]; then
          echo "==> 仍在等待... (${{WAITED}}s)"
        fi
      done
    fi

    rm -f /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress

    # Final check
    if ! xcode-select -p &>/dev/null; then
      echo "ERROR: Xcode Command Line Tools 安装失败"
      echo "请手动运行: xcode-select --install"
      exit 1
    fi
    echo "==> Xcode Command Line Tools 安装完成"
  else
    echo "==> Xcode CLT 已安装: $(xcode-select -p)"
  fi

  # Verify git
  if ! command -v git &>/dev/null; then
    echo "ERROR: Xcode CLT 已安装但 git 不可用"
    exit 1
  fi
  echo "==> git 已可用: $(git --version)"
fi

# ---------------------------------------------------------------
# Step 1: Check if a usable Node.js already exists
# ---------------------------------------------------------------
NEED_INSTALL=1

check_node() {{
  local NODE_BIN="$1"
  if [ -x "$NODE_BIN" ]; then
    local VER
    VER=$("$NODE_BIN" -v 2>/dev/null | sed 's/^v//')
    local MAJOR
    MAJOR=$(echo "$VER" | cut -d. -f1)
    if [ "$MAJOR" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
      echo "==> 检测到 Node.js v$VER (>= $NODE_MIN_MAJOR)，跳过安装"
      NEED_INSTALL=0
      # Make sure this node's bin dir is in PATH
      export PATH="$(dirname "$NODE_BIN"):$PATH"
      return 0
    else
      echo "==> 检测到 Node.js v$VER，版本过低 (需要 >= $NODE_MIN_MAJOR)"
    fi
  fi
  return 1
}}

echo "==> 检查 Node.js ..."

# 1a. Check our own managed install
check_node "$NODE_DIR/bin/node" || true

# 1b. Check system/nvm/brew node
if [ "$NEED_INSTALL" -eq 1 ]; then
  SYSTEM_NODE=$(command -v node 2>/dev/null || true)
  if [ -n "$SYSTEM_NODE" ]; then
    check_node "$SYSTEM_NODE" || true
  fi
fi

# ---------------------------------------------------------------
# Step 2: Install Node.js standalone binary if needed
# ---------------------------------------------------------------
if [ "$NEED_INSTALL" -eq 1 ]; then
  echo "==> 需要安装 Node.js ..."

  # Detect architecture
  ARCH=$(uname -m)
  case "$ARCH" in
    arm64|aarch64) NODE_ARCH="arm64" ;;
    x86_64)        NODE_ARCH="x64" ;;
    *)             echo "ERROR: 不支持的架构: $ARCH"; exit 1 ;;
  esac

  # Detect OS
  OS=$(uname -s)
  case "$OS" in
    Darwin) NODE_OS="darwin" ;;
    Linux)  NODE_OS="linux" ;;
    *)      echo "ERROR: 不支持的系统: $OS"; exit 1 ;;
  esac

  echo "==> 查询最新 LTS 版本..."
  INDEX_URL="{node_index_url}"
  NODE_VER=$(curl -fsSL "$INDEX_URL" | grep -m1 '"lts":"[A-Z]' | grep -o '"version":"v[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -z "$NODE_VER" ]; then
    echo "ERROR: 无法获取 Node.js LTS 版本号"
    exit 1
  fi
  echo "==> 最新 LTS: $NODE_VER"

  TARBALL="node-${{NODE_VER}}-${{NODE_OS}}-${{NODE_ARCH}}.tar.gz"
  DOWNLOAD_URL="{node_dist_base}/${{NODE_VER}}/$TARBALL"

  echo "==> 下载 $TARBALL ..."
  TMP_FILE=$(mktemp /tmp/node-XXXXXX.tar.gz)
  curl -fSL --progress-bar -o "$TMP_FILE" "$DOWNLOAD_URL"

  echo "==> 解压到 $NODE_DIR ..."
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xzf "$TMP_FILE" -C "$NODE_DIR" --strip-components=1
  rm -f "$TMP_FILE"

  export PATH="$NODE_DIR/bin:$PATH"
  echo "==> Node $(node -v) 安装完成"
fi

# ---------------------------------------------------------------
# Step 3: Verify node & npm
# ---------------------------------------------------------------
echo "==> Node version: $(node -v)"
echo "==> npm version: $(npm -v)"
{npm_mirror}
# ---------------------------------------------------------------
# Step 4: Install OpenClaw
# ---------------------------------------------------------------
echo "==> Installing OpenClaw via npm..."
npm install -g openclaw

# Ensure npm global bin is in PATH (needed when using system node)
NPM_GLOBAL_BIN="$(npm prefix -g)/bin"
export PATH="$NPM_GLOBAL_BIN:$PATH"

echo "==> Verifying installation..."
openclaw --version

echo "==> Recording binary path..."
OPENCLAW_BIN="$(which openclaw)"
echo "OPENCLAW_BIN=$OPENCLAW_BIN"

# ---------------------------------------------------------------
# Step 5: Add openclaw to user's shell PATH (persistent)
# ---------------------------------------------------------------
OPENCLAW_BIN_DIR="$(dirname "$OPENCLAW_BIN")"
PATH_LINE="export PATH=\"$OPENCLAW_BIN_DIR:\$PATH\""

add_to_profile() {{
  local profile="$1"
  if [ -f "$profile" ] || [ "$2" = "create" ]; then
    if ! grep -qF "$OPENCLAW_BIN_DIR" "$profile" 2>/dev/null; then
      echo "" >> "$profile"
      echo "# OpenClaw" >> "$profile"
      echo "$PATH_LINE" >> "$profile"
      echo "==> 已添加 PATH 到 $profile"
    fi
  fi
}}

# zsh (macOS default)
add_to_profile "$HOME/.zshrc" create
# bash
add_to_profile "$HOME/.bashrc"
add_to_profile "$HOME/.bash_profile"

echo "==> Done!"
"##,
        verbose = verbose_flag,
        node_index_url = node_index_url,
        node_dist_base = node_dist_base,
        npm_mirror = npm_mirror_cmd,
    );

    let session_id = spawn_install_session(&state, &cmd, false).await?;
    Ok(Json(serde_json::json!({ "session_id": session_id.to_string() })))
}

/// Shared helper: spawn a PTY session for an install command.
async fn spawn_install_session(
    state: &AppState,
    cmd: &str,
    with_sudo_keepalive: bool,
) -> Result<SessionId, (StatusCode, String)> {
    let (bridge, mut pty_rx, resize_tx) = pty::spawn_pty_cmd(
        "bash",
        &["-lc", cmd],
    )
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to start install PTY");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start PTY: {}", e))
    })?;

    let session_id = SessionId::new();
    tracing::info!(session_id = %session_id, "Install session created");
    let buffer = Arc::new(CircularBuffer::new());
    let (live_tx, _) = broadcast::channel::<Bytes>(LIVE_BROADCAST_CAP);

    // Create install log file: ~/.clawladder/logs/install/<timestamp>.log
    let log_file = {
        let home = std::env::var("HOME").unwrap_or_default();
        let log_dir = std::path::PathBuf::from(&home)
            .join(".clawladder")
            .join("logs")
            .join("install");
        let _ = std::fs::create_dir_all(&log_dir);
        let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let log_path = log_dir.join(format!("{}.log", ts));
        tracing::info!(path = %log_path.display(), "Install log file");
        std::fs::File::create(&log_path).ok()
    };

    let ctx = SessionContext {
        bridge,
        resize_tx,
        buffer: buffer.clone(),
        live_tx: live_tx.clone(),
    };
    state.registry.insert(session_id, ctx);

    // Ghost reader: PTY output → buffer + broadcast + log
    // Also intercepts "OPENCLAW_BIN=/path/to/openclaw" to persist the binary path.
    let registry_clone = state.registry.clone();
    let logger = state.logger.clone();
    let sid = session_id;
    let needs_sudo_cleanup = with_sudo_keepalive;
    tokio::spawn(async move {
        let mut accumulated = String::new();
        let mut log_writer = log_file.map(std::io::BufWriter::new);
        while let Some(data) = pty_rx.recv().await {
            logger.pty(&data);
            buffer.push(&data);
            let _ = live_tx.send(Bytes::from(data.clone()));

            // Write to install log file
            if let Some(ref mut w) = log_writer {
                use std::io::Write;
                let _ = w.write_all(&data);
                let _ = w.flush();
            }

            // Accumulate text to scan for OPENCLAW_BIN= marker
            if let Ok(text) = std::str::from_utf8(&data) {
                accumulated.push_str(text);
                // Check for the marker line
                if let Some(pos) = accumulated.find("OPENCLAW_BIN=") {
                    let rest = &accumulated[pos + "OPENCLAW_BIN=".len()..];
                    // Extract until newline or end of buffer
                    let end = rest.find('\n')
                        .or_else(|| rest.find('\r'))
                        .unwrap_or(rest.len());
                    let bin_path = rest[..end].trim().to_string();
                    if !bin_path.is_empty() {
                        tracing::info!(path = %bin_path, "Captured openclaw binary path from install");
                        let _ = clawladder_core::path_utils::save_bin_path(&bin_path);
                    }
                    // Stop accumulating — we found what we need
                    accumulated.clear();
                }
                // Prevent unbounded growth (keep last 1KB)
                if accumulated.len() > 1024 {
                    let drain = accumulated.len() - 512;
                    accumulated.drain(..drain);
                }
            }
        }
        let exit_code = registry_clone
            .get(&sid)
            .and_then(|ctx| ctx.bridge.wait_exit_code())
            .unwrap_or(1);
        tracing::info!(session_id = %sid, exit_code = exit_code, "Install PTY closed");

        // Write exit code to log
        if let Some(ref mut w) = log_writer {
            use std::io::Write;
            let _ = writeln!(w, "\n[exit code: {}]", exit_code);
            let _ = w.flush();
        }
        drop(log_writer);

        let exit_msg = format!("{{\"type\":\"exit\",\"code\":{}}}", exit_code);
        let _ = live_tx.send(Bytes::from(exit_msg.into_bytes()));

        if needs_sudo_cleanup {
            let _ = tokio::task::spawn_blocking(|| {
                let _ = std::process::Command::new("sudo")
                    .arg("-k")
                    .status();
            }).await;
        }
        let _ = registry_clone.remove(&sid);
    });

    // Sudo keepalive (only for Homebrew path)
    if with_sudo_keepalive {
        let keepalive_session_id = session_id;
        let keepalive_registry = state.registry.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                if !keepalive_registry.contains_key(&keepalive_session_id) {
                    break;
                }
                let _ = tokio::task::spawn_blocking(|| {
                    let _ = std::process::Command::new("sudo")
                        .args(["-n", "-v"])
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .status();
                }).await;
            }
        });
    }

    Ok(session_id)
}

// --- Session CRUD (kept for compatibility) ---

async fn create_session(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let (bridge, mut pty_rx, resize_tx) = pty::spawn_pty()
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to start PTY for session");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start PTY: {}", e))
        })?;

    let session_id = SessionId::new();
    tracing::info!(session_id = %session_id, "Session created");
    let buffer = Arc::new(CircularBuffer::new());
    let (live_tx, _) = broadcast::channel::<Bytes>(LIVE_BROADCAST_CAP);

    let ctx = SessionContext {
        bridge,
        resize_tx,
        buffer: buffer.clone(),
        live_tx: live_tx.clone(),
    };
    state.registry.insert(session_id, ctx);

    tokio::spawn(async move {
        while let Some(data) = pty_rx.recv().await {
            buffer.push(&data);
            let _ = live_tx.send(Bytes::from(data));
        }
    });

    Ok(Json(serde_json::json!({
        "session_id": session_id.to_string(),
    })))
}

async fn list_sessions(State(state): State<AppState>) -> Json<Vec<serde_json::Value>> {
    let list: Vec<_> = state
        .registry
        .iter()
        .map(|r| {
            serde_json::json!({
                "session_id": r.key().to_string(),
            })
        })
        .collect();
    Json(list)
}

async fn delete_session(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let uuid = uuid::Uuid::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid session_id".into()))?;
    if let Some((_, ctx)) = state.registry.remove(&SessionId(uuid)) {
        let _ = ctx.bridge.kill();
        tracing::info!(session_id = %id, "Session deleted");
    }
    Ok(StatusCode::NO_CONTENT)
}

// --- WebSocket ---

#[derive(Deserialize)]
struct WsQuery {
    session_id: Option<String>,
}

#[derive(Deserialize)]
struct ResizeMsg {
    #[serde(rename = "type")]
    ty: String,
    cols: u16,
    rows: u16,
}

async fn ws_handler(
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    if let Some(ref sid) = query.session_id {
        if let Ok(uuid) = uuid::Uuid::parse_str(sid) {
            let session_id = SessionId(uuid);
            let registry = state.registry.clone();
            return ws.on_upgrade(move |socket| handle_ws_attach(socket, session_id, registry));
        }
    }
    ws.on_upgrade(|mut socket| async move {
        let _ = socket
            .send(Message::Text("Missing or invalid session_id".into()))
            .await;
    })
}

async fn handle_ws_attach(mut socket: WebSocket, session_id: SessionId, registry: Registry) {
    tracing::info!(session_id = %session_id, "WebSocket attached");
    let (buffer, live_tx, writer, resize_tx) = {
        let ctx = match registry.get(&session_id) {
            Some(c) => c,
            None => {
                let _ = socket
                    .send(Message::Text("Session not found".into()))
                    .await;
                return;
            }
        };
        (
            ctx.buffer.clone(),
            ctx.live_tx.clone(),
            ctx.bridge.writer.clone(),
            ctx.resize_tx.clone(),
        )
    };

    let (mut ws_tx, mut ws_rx) = socket.split();

    // Send scrollback dump
    let dump = buffer.dump();
    if !dump.is_empty() {
        let _ = ws_tx.send(Message::Binary(Bytes::from(dump))).await;
    }

    let mut live_rx = live_tx.subscribe();

    let live_to_ws = async {
        while let Ok(bytes) = live_rx.recv().await {
            // Detect exit message (JSON text) vs normal PTY binary data
            let msg = if bytes.starts_with(b"{\"type\":\"exit\"") {
                Message::Text(String::from_utf8_lossy(&bytes).into_owned().into())
            } else {
                Message::Binary(bytes)
            };
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    };

    let ws_to_pty = async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match &msg {
                Message::Text(text) => {
                    if let Ok(resize) = serde_json::from_str::<ResizeMsg>(text) {
                        if resize.ty == "resize" {
                            let _ = resize_tx.send((resize.cols, resize.rows));
                            continue;
                        }
                    }
                    let data = text.as_bytes().to_vec();
                    let w = writer.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        if let Ok(mut guard) = w.lock() {
                            let _ = guard.write_all(&data);
                            let _ = guard.flush();
                        }
                    })
                    .await;
                }
                Message::Binary(b) => {
                    let data = b.to_vec();
                    let w = writer.clone();
                    let _ = tokio::task::spawn_blocking(move || {
                        if let Ok(mut guard) = w.lock() {
                            let _ = guard.write_all(&data);
                            let _ = guard.flush();
                        }
                    })
                    .await;
                }
                _ => {}
            }
        }
    };

    tokio::select! {
        _ = live_to_ws => {}
        _ = ws_to_pty => {}
    }
}

// --- Config endpoints ---

/// GET /api/config — return the current openclaw.json (or null if not yet created)
async fn get_config() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(config::read_config_raw)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    match result {
        Some(val) => Ok(Json(val)),
        None => Ok(Json(serde_json::json!(null))),
    }
}

/// POST /api/config — write the full openclaw.json
async fn save_config(
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tokio::task::spawn_blocking(move || config::write_config_raw(&body))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    tracing::info!("Config saved");
    Ok(Json(serde_json::json!({ "ok": true })))
}

// --- ClawLadder status endpoint ---

#[derive(Deserialize)]
struct ClawLadderStatusRequest {
    status: String,
}

/// POST /api/clawladder/status — set status in ~/.openclaw/clawladder.json (merge, do not overwrite openclaw_bin)
async fn set_clawladder_status(
    Json(body): Json<ClawLadderStatusRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let new_status = body.status;
    tokio::task::spawn_blocking(move || {
        let home = std::env::var("HOME").map_err(|_| "Cannot determine HOME".to_string())?;
        let dir = format!("{}/.openclaw", home);
        let config_path = format!("{}/clawladder.json", dir);

        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create dir: {}", e))?;

        // Merge status into existing JSON so we don't drop openclaw_bin
        let mut val: serde_json::Value = std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_else(|| serde_json::json!({}));

        val.as_object_mut()
            .ok_or_else(|| "clawladder.json is not an object".to_string())?
            .insert("status".to_string(), serde_json::json!(new_status));

        let json = serde_json::to_string_pretty(&val)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        std::fs::write(&config_path, json)
            .map_err(|e| format!("Failed to write clawladder.json: {}", e))?;

        Ok::<_, String>(())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    tracing::info!("ClawLadder status updated");
    Ok(Json(serde_json::json!({ "ok": true })))
}

// --- Gateway control endpoints ---

/// GET /api/gateway/status — structured gateway status
async fn get_gateway_status() -> Json<serde_json::Value> {
    let status = tokio::task::spawn_blocking(gateway::gateway_status)
        .await
        .unwrap_or_default();

    tracing::info!(running = status.running, installed = status.installed, "Gateway status");
    Json(serde_json::to_value(&status).unwrap_or_default())
}

/// GET /api/gateway/url — returns the gateway dashboard URL (with token) and WS URL
async fn get_gateway_url() -> Json<serde_json::Value> {
    let result = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let config_path = format!("{}/.openclaw/openclaw.json", home);
        let contents = std::fs::read_to_string(&config_path).unwrap_or_default();
        let config: serde_json::Value =
            serde_json::from_str(&contents).unwrap_or(serde_json::Value::Null);

        let port = config
            .get("gateway")
            .and_then(|g| g.get("port"))
            .and_then(|v| v.as_u64())
            .unwrap_or(18789);
        let token = config
            .get("gateway")
            .and_then(|g| g.get("auth"))
            .and_then(|a| a.get("token"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Note: OpenClaw dashboard uses device-token auth via WebSocket handshake,
        // NOT query-param tokens. The httpUrl is plain; use `openclaw dashboard` to open
        // with proper auth. We still return the token for display/copy purposes.
        let http_url = format!("http://127.0.0.1:{}", port);
        let ws_url = format!("ws://127.0.0.1:{}", port);

        serde_json::json!({
            "httpUrl": http_url,
            "wsUrl": ws_url,
            "port": port,
            "token": token,
        })
    })
    .await
    .unwrap_or(serde_json::json!({}));

    Json(result)
}

/// POST /api/gateway/open-dashboard — run `openclaw dashboard` to open the Control UI with auth
async fn gateway_open_dashboard_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = format!("{} dashboard", bin);
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                if out.status.success() {
                    Ok(stdout)
                } else {
                    Err(if stderr.is_empty() { stdout } else { stderr })
                }
            }
            Err(e) => Err(format!("Failed to run openclaw dashboard: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;

    match result {
        Ok(msg) => Ok(Json(serde_json::json!({ "ok": true, "message": msg }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// POST /api/gateway/install — register gateway as system service
async fn gateway_install_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(gateway::gateway_install)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(msg) => {
            tracing::info!("Gateway installed");
            Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
        }
        Err(e) => {
            tracing::error!(error = %e, "Gateway install failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

/// POST /api/gateway/start
async fn gateway_start_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(gateway::gateway_start)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(msg) => {
            tracing::info!("Gateway started");
            Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
        }
        Err(e) => {
            tracing::error!(error = %e, "Gateway start failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

/// POST /api/gateway/restart
async fn gateway_restart_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(gateway::gateway_restart)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(msg) => {
            tracing::info!("Gateway restarted");
            Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
        }
        Err(e) => {
            tracing::error!(error = %e, "Gateway restart failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

/// POST /api/gateway/stop
async fn gateway_stop_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(gateway::gateway_stop)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(msg) => {
            tracing::info!("Gateway stopped");
            Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
        }
        Err(e) => {
            tracing::error!(error = %e, "Gateway stop failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

/// POST /api/gateway/uninstall
async fn gateway_uninstall_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(gateway::gateway_uninstall)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(msg) => {
            tracing::info!("Gateway uninstalled");
            Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
        }
        Err(e) => {
            tracing::error!(error = %e, "Gateway uninstall failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

/// Simple shell escaping: wrap in single quotes.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

// ---------------------------------------------------------------------------
// Onboarding: run `openclaw onboard` with user-provided flags
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct OnboardRequest {
    /// Auth choice (e.g. "apiKey", "skip")
    #[serde(default)]
    auth_choice: Option<String>,
    /// API key for the chosen provider
    #[serde(default)]
    api_key: Option<String>,
    /// Default model (e.g. "claude-sonnet-4-20250514")
    #[serde(default)]
    model: Option<String>,
    /// Whether to install the gateway daemon
    #[serde(default = "default_true")]
    install_daemon: bool,
    /// Skip channel setup (we do it separately via config set)
    #[serde(default = "default_true")]
    skip_channels: bool,
    /// Skip skills setup
    #[serde(default = "default_true")]
    skip_skills: bool,
    /// Skip search setup
    #[serde(default = "default_true")]
    skip_search: bool,
    /// Skip health check
    #[serde(default = "default_true")]
    skip_health: bool,
    /// Skip opening UI
    #[serde(default = "default_true")]
    skip_ui: bool,
}

fn default_true() -> bool {
    true
}

/// POST /api/onboard — run `openclaw onboard --non-interactive` with flags,
/// then apply channel config via `openclaw config set`.
async fn run_onboard_handler(
    State(_state): State<AppState>,
    Json(body): Json<OnboardRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Onboard requested");

    // Build the openclaw onboard command
    let mut args = vec![
        "onboard".to_string(),
        "--non-interactive".to_string(),
        "--accept-risk".to_string(),
    ];

    if let Some(ref auth) = body.auth_choice {
        args.push("--auth-choice".to_string());
        args.push(auth.clone());
    } else {
        args.push("--auth-choice".to_string());
        args.push("skip".to_string());
    }

    if let Some(ref key) = body.api_key {
        // Map auth choice to the right flag
        let flag = match body.auth_choice.as_deref() {
            Some("apiKey") => "--anthropic-api-key",
            Some("openai-api-key") => "--openai-api-key",
            Some("gemini-api-key") => "--gemini-api-key",
            Some("openrouter-api-key") => "--openrouter-api-key",
            _ => "--anthropic-api-key",
        };
        args.push(flag.to_string());
        args.push(key.clone());
    }

    if let Some(ref model) = body.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }

    if body.install_daemon {
        args.push("--install-daemon".to_string());
    }
    if body.skip_channels {
        args.push("--skip-channels".to_string());
    }
    if body.skip_skills {
        args.push("--skip-skills".to_string());
    }
    if body.skip_search {
        args.push("--skip-search".to_string());
    }
    if body.skip_health {
        args.push("--skip-health".to_string());
    }
    if body.skip_ui {
        args.push("--skip-ui".to_string());
    }

    args.push("--json".to_string());

    let cmd_str = format!("{} {}", clawladder_core::path_utils::resolve_openclaw_bin(), args.join(" "));
    tracing::info!(cmd = %cmd_str, "Running onboard");

    let result = tokio::task::spawn_blocking(move || {
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if output.status.success() {
                    Ok(stdout)
                } else {
                    Err(format!(
                        "onboard failed (exit {}): {}{}",
                        output.status.code().unwrap_or(-1),
                        stderr,
                        if stderr.is_empty() { &stdout } else { "" }
                    ))
                }
            }
            Err(e) => Err(format!("Failed to run openclaw onboard: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(output) => {
            tracing::info!("Onboard completed");
            Ok(Json(serde_json::json!({ "ok": true, "output": output })))
        }
        Err(e) => {
            tracing::error!(error = %e, "Onboard failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

// ---------------------------------------------------------------------------
// Doctor: run `openclaw doctor --repair --non-interactive`
// ---------------------------------------------------------------------------

/// POST /api/doctor — run `openclaw doctor` with repair flags
async fn run_doctor_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Doctor requested");

    let result = tokio::task::spawn_blocking(|| {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = format!("{} doctor --repair --non-interactive", bin);
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if output.status.success() {
                    Ok(serde_json::json!({ "ok": true, "output": stdout }))
                } else {
                    Ok(serde_json::json!({
                        "ok": false,
                        "output": format!("{}{}", stdout, stderr),
                        "exit_code": output.status.code(),
                    }))
                }
            }
            Err(e) => Err(format!("Failed to run openclaw doctor: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(val) => {
            tracing::info!("Doctor completed");
            Ok(Json(val))
        }
        Err(e) => {
            tracing::error!(error = %e, "Doctor failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, e))
        }
    }
}

// ---------------------------------------------------------------------------
// Config set: run `openclaw config set <path> <value>`
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ConfigSetRequest {
    path: String,
    value: String,
}

/// POST /api/config/set — run `openclaw config set <path> <value>`
async fn config_set_handler(
    Json(body): Json<ConfigSetRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let bin = clawladder_core::path_utils::resolve_openclaw_bin();
    let cmd_str = format!(
        "{} config set {} {}",
        bin,
        shell_escape(&body.path),
        shell_escape(&body.value)
    );
    tracing::info!(cmd = %cmd_str, "Config set");

    let result = tokio::task::spawn_blocking(move || {
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if output.status.success() {
                    Ok(stdout)
                } else {
                    Err(format!("config set failed: {}{}", stderr, if stderr.is_empty() { &stdout } else { "" }))
                }
            }
            Err(e) => Err(format!("Failed to run openclaw config set: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(output) => Ok(Json(serde_json::json!({ "ok": true, "output": output }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

// ---------------------------------------------------------------------------
// Models: list providers and models from openclaw catalog
// ---------------------------------------------------------------------------

/// GET /api/models/providers — list all available providers with their models
async fn list_providers_handler(
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = format!("{} models list --all --json", bin);
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                // JSON may be preceded by warning lines; find the first `{`
                let json_str = match stdout.find('{') {
                    Some(pos) => &stdout[pos..],
                    None => return Err("No JSON in openclaw models list output".to_string()),
                };
                let val: serde_json::Value = serde_json::from_str(json_str)
                    .map_err(|e| format!("Failed to parse models JSON: {}", e))?;

                // Extract unique providers with their models
                let mut providers: std::collections::BTreeMap<String, Vec<serde_json::Value>> =
                    std::collections::BTreeMap::new();
                if let Some(models) = val.get("models").and_then(|m| m.as_array()) {
                    for m in models {
                        let key = m.get("key").and_then(|k| k.as_str()).unwrap_or("");
                        if let Some(slash) = key.find('/') {
                            let provider = &key[..slash];
                            let model_id = &key[slash + 1..];
                            providers
                                .entry(provider.to_string())
                                .or_default()
                                .push(serde_json::json!({
                                    "id": model_id,
                                    "key": key,
                                    "name": m.get("name").and_then(|n| n.as_str()).unwrap_or(model_id),
                                    "input": m.get("input").and_then(|i| i.as_str()).unwrap_or("text"),
                                    "contextWindow": m.get("contextWindow").and_then(|c| c.as_u64()).unwrap_or(0),
                                    "available": m.get("available").and_then(|a| a.as_bool()).unwrap_or(false),
                                    "local": m.get("local").and_then(|l| l.as_bool()).unwrap_or(false),
                                    "tags": m.get("tags").cloned().unwrap_or(serde_json::Value::Array(vec![])),
                                }));
                        }
                    }
                }

                let provider_list: Vec<serde_json::Value> = providers
                    .into_iter()
                    .map(|(name, models)| {
                        // Determine if this is a built-in provider (has models in catalog)
                        // or a custom one (user-configured)
                        let is_custom = name.starts_with("custom");
                        serde_json::json!({
                            "id": name,
                            "label": provider_display_name(&name),
                            "builtin": !is_custom,
                            "modelCount": models.len(),
                            "models": models,
                        })
                    })
                    .collect();

                Ok(serde_json::json!({
                    "providers": provider_list,
                    "totalModels": val.get("count").and_then(|c| c.as_u64()).unwrap_or(0),
                }))
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                Err(format!("openclaw models list failed: {}", stderr))
            }
            Err(e) => Err(format!("Failed to run openclaw models list: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// GET /api/models/list?provider=xxx — list models, optionally filtered by provider
async fn list_models_handler(
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let provider_filter = query.get("provider").cloned();

    let result = tokio::task::spawn_blocking(move || {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let mut cmd_str = format!("{} models list --all --json", bin);
        if let Some(ref p) = provider_filter {
            cmd_str.push_str(&format!(" --provider {}", shell_escape(p)));
        }
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let json_str = match stdout.find('{') {
                    Some(pos) => &stdout[pos..],
                    None => return Err("No JSON in output".to_string()),
                };
                serde_json::from_str::<serde_json::Value>(json_str)
                    .map_err(|e| format!("Failed to parse: {}", e))
            }
            Ok(output) => {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
            Err(e) => Err(format!("Failed to run: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Human-readable display name for a provider id
fn provider_display_name(id: &str) -> &str {
    match id {
        "openai" => "OpenAI",
        "openai-codex" => "OpenAI Codex",
        "anthropic" => "Anthropic",
        "google" => "Google AI",
        "google-gemini-cli" => "Gemini CLI",
        "google-vertex" => "Google Vertex AI",
        "google-antigravity" => "Google Antigravity",
        "amazon-bedrock" => "Amazon Bedrock",
        "azure-openai-responses" => "Azure OpenAI",
        "groq" => "Groq",
        "mistral" => "Mistral",
        "xai" => "xAI (Grok)",
        "openrouter" => "OpenRouter",
        "opencode" => "OpenCode",
        "opencode-go" => "OpenCode Go",
        "cerebras" => "Cerebras",
        "huggingface" => "Hugging Face",
        "minimax" => "MiniMax",
        "minimax-cn" => "MiniMax (CN)",
        "kimi-coding" => "Kimi Coding",
        "zai" => "Z.AI",
        "vercel-ai-gateway" => "Vercel AI Gateway",
        "github-copilot" => "GitHub Copilot",
        _ => id,
    }
}

// ---------------------------------------------------------------------------
// Skills & Hooks
// ---------------------------------------------------------------------------

/// GET /api/openclaw/status — full OpenClaw status with usage data
async fn openclaw_status_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| run_openclaw_json("status --usage --json"))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Helper: run an openclaw CLI command and return parsed JSON
fn run_openclaw_json(args: &str) -> Result<serde_json::Value, String> {
    let bin = clawladder_core::path_utils::resolve_openclaw_bin();
    let cmd_str = format!("{} {}", bin, args);
    let shell = clawladder_core::path_utils::user_shell();
    let mut cmd = std::process::Command::new(&shell);
    cmd.args(["-lc", &cmd_str]);
    clawladder_core::path_utils::apply_rich_env(&mut cmd);
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !output.status.success() {
                return Err(format!("{}{}", stderr, if stderr.is_empty() { &stdout } else { "" }));
            }
            // JSON may be preceded by warning/banner lines
            let json_start = stdout.find('{').or_else(|| stdout.find('['));
            match json_start {
                Some(pos) => serde_json::from_str(&stdout[pos..])
                    .map_err(|e| format!("JSON parse error: {}", e)),
                None => Err(format!("No JSON in output: {}", &stdout[..stdout.len().min(200)])),
            }
        }
        Err(e) => Err(format!("Failed to run {}: {}", cmd_str, e)),
    }
}

/// GET /api/skills/list — returns eligible skills with descriptions
async fn list_skills_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| run_openclaw_json("skills list --eligible --json"))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// GET /api/hooks/list
async fn list_hooks_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| run_openclaw_json("hooks list --json"))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
struct HookToggleRequest {
    name: String,
}

/// POST /api/hooks/enable
async fn hook_enable_handler(
    Json(body): Json<HookToggleRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let name = body.name;
    let result = tokio::task::spawn_blocking(move || {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = format!("{} hooks enable {}", bin, shell_escape(&name));
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => Err(String::from_utf8_lossy(&output.stderr).to_string()),
            Err(e) => Err(format!("Failed: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(()) => Ok(Json(serde_json::json!({ "ok": true }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// POST /api/hooks/disable
async fn hook_disable_handler(
    Json(body): Json<HookToggleRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let name = body.name;
    let result = tokio::task::spawn_blocking(move || {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = format!("{} hooks disable {}", bin, shell_escape(&name));
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => Err(String::from_utf8_lossy(&output.stderr).to_string()),
            Err(e) => Err(format!("Failed: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(()) => Ok(Json(serde_json::json!({ "ok": true }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

// ---------------------------------------------------------------------------
// ClawHub: install clawhub CLI + install skills from clawhub
// ---------------------------------------------------------------------------

/// GET /api/clawhub/status — check if clawhub CLI is installed
async fn clawhub_status_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| {
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", "clawhub --version"]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(serde_json::json!({ "installed": true, "version": version }))
            }
            _ => Ok(serde_json::json!({ "installed": false })),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// POST /api/clawhub/install — install clawhub via npm i -g clawhub
async fn clawhub_install_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| {
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", "npm install -g clawhub"]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Err(format!("npm install failed: {}{}", stderr, if stderr.is_empty() { &stdout } else { "" }))
            }
            Err(e) => Err(format!("Failed to run npm: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(()) => Ok(Json(serde_json::json!({ "ok": true }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
struct ClawHubSkillInstallRequest {
    url: String,
}

/// POST /api/clawhub/skill-install — install a skill from clawhub URL
async fn clawhub_skill_install_handler(
    Json(body): Json<ClawHubSkillInstallRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let url = body.url;
    let result = tokio::task::spawn_blocking(move || {
        let cmd_str = format!("clawhub install {}", shell_escape(&url));
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(serde_json::json!({ "ok": true, "output": stdout }))
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Err(format!("clawhub install failed: {}{}", stderr, if stderr.is_empty() { &stdout } else { "" }))
            }
            Err(e) => Err(format!("Failed to run clawhub: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Deserialize)]
struct ClawHubSkillUninstallRequest {
    slug: String,
}

/// POST /api/clawhub/skill-uninstall — uninstall a skill via clawhub
async fn clawhub_skill_uninstall_handler(
    Json(body): Json<ClawHubSkillUninstallRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let slug = body.slug;
    let result = tokio::task::spawn_blocking(move || {
        let cmd_str = format!("clawhub uninstall {} --yes", shell_escape(&slug));
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) if output.status.success() => {
                Ok(serde_json::json!({ "ok": true }))
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let msg = format!("{}{}", stderr, if stderr.is_empty() { &stdout } else { "" });
                // "not found" / "not installed" is not a real error
                if msg.to_lowercase().contains("not found") || msg.to_lowercase().contains("not installed") {
                    Ok(serde_json::json!({ "ok": true, "skipped": true }))
                } else {
                    Err(format!("clawhub uninstall failed: {}", msg))
                }
            }
            Err(e) => Err(format!("Failed to run clawhub: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;
    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

// ---------------------------------------------------------------------------
// Models auth: OAuth / setup-token login
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ModelsAuthLoginRequest {
    /// Provider name, e.g. "anthropic", "openai-codex", "qwen-portal"
    provider: String,
    /// Optional: for setup-token flow, the token value
    #[serde(default)]
    setup_token: Option<String>,
    /// Optional: for onboard --auth-choice flow
    #[serde(default)]
    auth_choice: Option<String>,
}

/// POST /api/models/auth/login — trigger OAuth or setup-token login
async fn models_auth_login_handler(
    Json(body): Json<ModelsAuthLoginRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let provider = body.provider;
    let setup_token = body.setup_token;
    let auth_choice = body.auth_choice;

    // Only the pure OAuth path (`models auth login`) needs browser URL interception.
    // setup-token and onboard paths are non-interactive — no browser needed.
    let needs_browser = setup_token.is_none() && auth_choice.is_none();

    let result = tokio::task::spawn_blocking(move || {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = if let Some(token) = &setup_token {
            format!(
                "{} models auth setup-token --provider {} --token {}",
                bin,
                shell_escape(&provider),
                shell_escape(token)
            )
        } else if let Some(choice) = &auth_choice {
            format!(
                "{} onboard --non-interactive --mode local --auth-choice {} --skip-channels --skip-skills --skip-search --skip-health --skip-ui",
                bin,
                shell_escape(choice)
            )
        } else {
            format!(
                "{} models auth login --provider {} --set-default",
                bin,
                shell_escape(&provider)
            )
        };

        tracing::info!("Auth login command: {} (needs_browser={})", cmd_str, needs_browser);

        if needs_browser {
            // Stream stdout/stderr so we can intercept the first OAuth URL and open it
            run_with_browser_intercept(&cmd_str)
        } else {
            // Simple blocking execution — no URL interception
            run_simple(&cmd_str)
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;

    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

/// Run a command, capture output, return JSON result. No URL interception.
fn run_simple(cmd_str: &str) -> Result<serde_json::Value, String> {
    let shell = clawladder_core::path_utils::user_shell();
    let mut cmd = std::process::Command::new(&shell);
    cmd.args(["-lc", cmd_str]);
    clawladder_core::path_utils::apply_rich_env(&mut cmd);
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if output.status.success() {
                Ok(serde_json::json!({ "ok": true, "output": stdout }))
            } else {
                Ok(serde_json::json!({ "ok": false, "output": format!("{}{}", stdout, stderr) }))
            }
        }
        Err(e) => Err(format!("Failed: {}", e)),
    }
}

/// Run a command while streaming output. Opens the first URL found in the
/// output in the system browser (for OAuth login flows).
fn run_with_browser_intercept(cmd_str: &str) -> Result<serde_json::Value, String> {
    use std::io::BufRead;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    let shell = clawladder_core::path_utils::user_shell();
    let mut cmd = std::process::Command::new(&shell);
    cmd.args(["-lc", cmd_str]);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    clawladder_core::path_utils::apply_rich_env(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    // Flag: only open the first URL we find across both streams
    let opened = Arc::new(AtomicBool::new(false));

    let opened_out = opened.clone();
    let stdout_handle = std::thread::spawn(move || {
        let mut collected = String::new();
        if let Some(pipe) = stdout_pipe {
            let reader = std::io::BufReader::new(pipe);
            for line in reader.lines().flatten() {
                tracing::info!("[auth stdout] {}", line);
                if !opened_out.load(Ordering::Relaxed) {
                    if let Some(url) = extract_first_url(&line) {
                        tracing::info!("Opening OAuth URL in browser: {}", url);
                        if open::that(&url).is_ok() {
                            opened_out.store(true, Ordering::Relaxed);
                        }
                    }
                }
                collected.push_str(&line);
                collected.push('\n');
            }
        }
        collected
    });

    let opened_err = opened.clone();
    let stderr_handle = std::thread::spawn(move || {
        let mut collected = String::new();
        if let Some(pipe) = stderr_pipe {
            let reader = std::io::BufReader::new(pipe);
            for line in reader.lines().flatten() {
                tracing::info!("[auth stderr] {}", line);
                if !opened_err.load(Ordering::Relaxed) {
                    if let Some(url) = extract_first_url(&line) {
                        tracing::info!("Opening OAuth URL in browser: {}", url);
                        if open::that(&url).is_ok() {
                            opened_err.store(true, Ordering::Relaxed);
                        }
                    }
                }
                collected.push_str(&line);
                collected.push('\n');
            }
        }
        collected
    });

    let status = child.wait().map_err(|e| format!("Wait failed: {}", e))?;
    let stdout = stdout_handle.join().unwrap_or_default();
    let stderr = stderr_handle.join().unwrap_or_default();

    if status.success() {
        Ok(serde_json::json!({ "ok": true, "output": stdout }))
    } else {
        Ok(serde_json::json!({
            "ok": false,
            "output": format!("{}{}", stdout, stderr),
        }))
    }
}

/// Extract the first URL from a line of text. Returns None if no URL found.
fn extract_first_url(line: &str) -> Option<String> {
    for word in line.split_whitespace() {
        let url = word.trim_matches(|c: char| {
            c == '"' || c == '\'' || c == '<' || c == '>' || c == '(' || c == ')'
        });
        if (url.starts_with("http://") || url.starts_with("https://")) && url.len() > 10 {
            return Some(url.to_string());
        }
    }
    None
}

/// GET /api/models/auth/status?provider=xxx — check auth status
async fn models_auth_status_handler(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let provider = params.get("provider").cloned().unwrap_or_default();
    let result = tokio::task::spawn_blocking(move || {
        run_openclaw_json("models status --json")
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;

    match result {
        Ok(val) => {
            let authenticated = val
                .get("providers")
                .and_then(|p| p.as_array())
                .map(|arr| {
                    arr.iter().any(|p| {
                        p.get("id")
                            .and_then(|id| id.as_str())
                            .map(|id| id == provider)
                            .unwrap_or(false)
                            && p.get("authenticated")
                                .and_then(|a| a.as_bool())
                                .unwrap_or(false)
                    })
                })
                .unwrap_or(false);
            Ok(Json(serde_json::json!({
                "provider": provider,
                "authenticated": authenticated,
                "raw": val,
            })))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

// ---------------------------------------------------------------------------
// Usage stats: scan JSONL files for token usage
// ---------------------------------------------------------------------------

/// GET /api/usage?days=30 — scan session JSONL files and return aggregated usage
async fn usage_stats_handler(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let days: u32 = params
        .get("days")
        .and_then(|d| d.parse().ok())
        .unwrap_or(30);

    let stats = tokio::task::spawn_blocking(move || usage::scan_usage(days))
        .await
        .unwrap_or_default();

    Json(serde_json::to_value(&stats).unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Plugins: enable/disable
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PluginRequest {
    name: String,
}

/// POST /api/plugins/enable — enable an OpenClaw plugin
async fn plugins_enable_handler(
    Json(body): Json<PluginRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let name = body.name;
    let result = tokio::task::spawn_blocking(move || {
        let bin = clawladder_core::path_utils::resolve_openclaw_bin();
        let cmd_str = format!("{} plugins enable {}", bin, shell_escape(&name));
        let shell = clawladder_core::path_utils::user_shell();
        let mut cmd = std::process::Command::new(&shell);
        cmd.args(["-lc", &cmd_str]);
        clawladder_core::path_utils::apply_rich_env(&mut cmd);
        match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if output.status.success() {
                    Ok(serde_json::json!({ "ok": true, "output": stdout }))
                } else {
                    Err(format!("{}{}", stderr, stdout))
                }
            }
            Err(e) => Err(format!("Failed: {}", e)),
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join: {}", e)))?;

    match result {
        Ok(val) => Ok(Json(val)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

