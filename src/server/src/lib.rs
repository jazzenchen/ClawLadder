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
        // Onboarding: run `openclaw onboard` with flags
        .route("/api/onboard", post(run_onboard_handler))
        // Skills & Hooks
        .route("/api/skills/list", get(list_skills_handler))
        .route("/api/hooks/list", get(list_hooks_handler))
        .route("/api/hooks/enable", post(hook_enable_handler))
        .route("/api/hooks/disable", post(hook_disable_handler))
        // Auth: OAuth / plugin login
        .route("/api/models/auth/login", post(models_auth_login_handler))
        .route("/api/models/auth/status", get(models_auth_status_handler))
        .route("/api/plugins/enable", post(plugins_enable_handler))
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
/// Check if ClawLadder is installed and/or running.
async fn check_status() -> Json<serde_json::Value> {
    let (installed, version) = tokio::task::spawn_blocking(|| {
        // Use a login shell so that the user's PATH (from .bashrc/.zshrc/etc.)
        // is loaded — openclaw may have been installed to a directory not in
        // the server process's inherited PATH.
        let mut cmd = std::process::Command::new("bash");
        cmd.args(["-lc", "openclaw --version"]);
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

    // Check ClawLadder status from ~/.openclaw/clawladder.json
    // Possible values: null (no clawladder.json), "none" (openclaw.json exists but no clawladder.json),
    // "installed" (install+onboard done), "configured" (wizard completed)
    let (configured, clawladder_status) = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let openclaw_config = format!("{}/.openclaw/openclaw.json", home);
        let clawladder_config = format!("{}/.openclaw/clawladder.json", home);

        // First check if openclaw.json exists at all
        let openclaw_exists = std::fs::metadata(&openclaw_config).is_ok();

        match std::fs::read_to_string(&clawladder_config) {
            Ok(contents) => {
                match serde_json::from_str::<serde_json::Value>(&contents) {
                    Ok(val) => {
                        let cl_status = val.get("status")
                            .and_then(|s| s.as_str())
                            .map(|s| s.to_string());
                        let configured = cl_status.as_deref() == Some("configured");
                        let status_str = cl_status.unwrap_or_else(|| "none".to_string());
                        (configured, Some(status_str))
                    }
                    Err(_) => (false, if openclaw_exists { Some("none".to_string()) } else { None }),
                }
            }
            Err(_) => {
                // No clawladder.json — check if openclaw.json exists
                if openclaw_exists {
                    (false, Some("none".to_string()))
                } else {
                    (false, None)
                }
            }
        }
    })
    .await
    .unwrap_or((false, None));

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

    tracing::info!(installed = installed, configured = configured, running = running, ?clawladder_status, "Status check");
    Json(serde_json::json!({
        "installed": installed,
        "version": version,
        "configured": configured,
        "running": running,
        "clawladder_status": clawladder_status,
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
        "export SUDO_ASKPASS={} NONINTERACTIVE=1{} && sudo -A -v && bash {} --no-prompt --npm --no-onboard; rm -f {}",
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
    tracing::info!("Install requested (nvm path, no sudo)");
    let verbose_flag = if body.verbose { "set -x && " } else { "" };

    let cmd = format!(
        r#"{verbose}
echo "==> Checking nvm..."
if [ ! -d "$HOME/.nvm" ]; then
  echo "==> nvm not found, installing..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
else
  echo "==> nvm already installed, skipping"
fi

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"

echo "==> Installing Node.js 24 via nvm..."
nvm install 24
nvm use 24

echo "==> Node version: $(node -v)"
echo "==> npm version: $(npm -v)"

echo "==> Installing OpenClaw via npm..."
npm install -g openclaw

echo "==> Linking binary..."
npm rebuild -g openclaw

echo "==> Verifying installation..."
export PATH="$NVM_DIR/versions/node/$(nvm current)/bin:$PATH"
openclaw --version

echo "==> Done!"
"#,
        verbose = verbose_flag,
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

    let ctx = SessionContext {
        bridge,
        resize_tx,
        buffer: buffer.clone(),
        live_tx: live_tx.clone(),
    };
    state.registry.insert(session_id, ctx);

    // Ghost reader: PTY output → buffer + broadcast + log
    let registry_clone = state.registry.clone();
    let logger = state.logger.clone();
    let sid = session_id;
    let needs_sudo_cleanup = with_sudo_keepalive;
    tokio::spawn(async move {
        while let Some(data) = pty_rx.recv().await {
            logger.pty(&data);
            buffer.push(&data);
            let _ = live_tx.send(Bytes::from(data));
        }
        let exit_code = registry_clone
            .get(&sid)
            .and_then(|ctx| ctx.bridge.wait_exit_code())
            .unwrap_or(1);
        tracing::info!(session_id = %sid, exit_code = exit_code, "Install PTY closed");

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

/// POST /api/clawladder/status — set status in ~/.openclaw/clawladder.json
async fn set_clawladder_status(
    Json(body): Json<ClawLadderStatusRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let new_status = body.status;
    tokio::task::spawn_blocking(move || {
        let home = std::env::var("HOME").map_err(|_| "Cannot determine HOME".to_string())?;
        let dir = format!("{}/.openclaw", home);
        let config_path = format!("{}/clawladder.json", dir);

        // Create directory if needed
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create dir: {}", e))?;

        // Write clawladder.json with status
        let val = serde_json::json!({ "status": new_status });
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

        let http_url = if token.is_empty() {
            format!("http://127.0.0.1:{}", port)
        } else {
            format!("http://127.0.0.1:{}/?token={}", port, token)
        };
        let ws_url = if token.is_empty() {
            format!("ws://127.0.0.1:{}", port)
        } else {
            format!("ws://127.0.0.1:{}/?token={}", port, token)
        };

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

    let cmd_str = format!("openclaw {}", args.join(" "));
    tracing::info!(cmd = %cmd_str, "Running onboard");

    let result = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("bash");
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
    let cmd_str = format!(
        "openclaw config set {} {}",
        shell_escape(&body.path),
        shell_escape(&body.value)
    );
    tracing::info!(cmd = %cmd_str, "Config set");

    let result = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("bash");
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
        let mut cmd = std::process::Command::new("bash");
        cmd.args(["-lc", "openclaw models list --all --json"]);
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
        let mut cmd_str = "openclaw models list --all --json".to_string();
        if let Some(ref p) = provider_filter {
            cmd_str.push_str(&format!(" --provider {}", shell_escape(p)));
        }
        let mut cmd = std::process::Command::new("bash");
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

/// Helper: run an openclaw CLI command and return parsed JSON
fn run_openclaw_json(args: &str) -> Result<serde_json::Value, String> {
    let cmd_str = format!("openclaw {}", args);
    let mut cmd = std::process::Command::new("bash");
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

/// GET /api/skills/list
async fn list_skills_handler() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = tokio::task::spawn_blocking(|| run_openclaw_json("skills check --json"))
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
        let cmd_str = format!("openclaw hooks enable {}", shell_escape(&name));
        let mut cmd = std::process::Command::new("bash");
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
        let cmd_str = format!("openclaw hooks disable {}", shell_escape(&name));
        let mut cmd = std::process::Command::new("bash");
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
        let cmd_str = if let Some(token) = &setup_token {
            format!(
                "openclaw models auth setup-token --provider {} --token {}",
                shell_escape(&provider),
                shell_escape(token)
            )
        } else if let Some(choice) = &auth_choice {
            format!(
                "openclaw onboard --non-interactive --mode local --auth-choice {} --skip-channels --skip-skills --skip-search --skip-health --skip-ui",
                shell_escape(choice)
            )
        } else {
            format!(
                "openclaw models auth login --provider {} --set-default",
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
    let mut cmd = std::process::Command::new("bash");
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

    let mut cmd = std::process::Command::new("bash");
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
        let cmd_str = format!("openclaw plugins enable {}", shell_escape(&name));
        let mut cmd = std::process::Command::new("bash");
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

