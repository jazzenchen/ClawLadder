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
        let output = std::process::Command::new("bash")
            .args(["-lc", "openclaw --version"])
            .output();
        match output {
            Ok(o) if o.status.success() => {
                let ver = String::from_utf8_lossy(&o.stdout).trim().to_string();
                (true, Some(ver))
            }
            _ => (false, None),
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

    tracing::info!(installed = installed, running = running, "Status check");
    Json(serde_json::json!({
        "installed": installed,
        "version": version,
        "running": running,
    }))
}

// --- Install endpoint ---

#[derive(Deserialize)]
struct InstallRequest {
    password: String,
    #[serde(default)]
    verbose: bool,
}

async fn start_install(
    State(state): State<AppState>,
    Json(body): Json<InstallRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    tracing::info!("Install requested");
    let script_path = state.install_script.clone();
    if !script_path.exists() {
        tracing::error!(path = %script_path.display(), "Install script not found");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Install script not found: {}", script_path.display()),
        ));
    }

    // Create a temporary askpass script that outputs the password.
    // sudo -A will call this script instead of reading from tty/stdin.
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

    // Command: cache sudo via askpass, then run install script.
    let script_str = script_path.to_string_lossy().to_string();
    let askpass_str = askpass_path.to_string_lossy().to_string();
    let verbose_env = if body.verbose { " OPENCLAW_VERBOSE=1" } else { "" };
    let sudo_then_install = format!(
        "export SUDO_ASKPASS={} NONINTERACTIVE=1{} && sudo -A -v && bash {} --no-prompt --npm --no-onboard; rm -f {}",
        shell_escape(&askpass_str),
        verbose_env,
        shell_escape(&script_str),
        shell_escape(&askpass_str),
    );
    let (bridge, mut pty_rx, resize_tx) = pty::spawn_pty_cmd(
        "bash",
        &["-lc", &sudo_then_install],
    )
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to start install PTY");
        let _ = std::fs::remove_file(&askpass_path);
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
    tokio::spawn(async move {
        while let Some(data) = pty_rx.recv().await {
            logger.pty(&data);
            buffer.push(&data);
            let _ = live_tx.send(Bytes::from(data));
        }
        // PTY output stream ended — wait for exit code from the session's bridge
        let exit_code = registry_clone
            .get(&sid)
            .and_then(|ctx| ctx.bridge.wait_exit_code())
            .unwrap_or(1);
        tracing::info!(session_id = %sid, exit_code = exit_code, "Install PTY closed");

        // Send exit code as a JSON text message through broadcast
        let exit_msg = format!("{{\"type\":\"exit\",\"code\":{}}}", exit_code);
        let _ = live_tx.send(Bytes::from(exit_msg.into_bytes()));

        // PTY closed — install finished. Clear sudo credentials.
        let _ = tokio::task::spawn_blocking(|| {
            let _ = std::process::Command::new("sudo")
                .arg("-k")
                .status();
        }).await;
        // Remove session from registry
        let _ = registry_clone.remove(&sid);
    });

    // Sudo keepalive: refresh credentials every 60s
    let keepalive_session_id = session_id;
    let keepalive_registry = state.registry.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            // If session is gone, install is done — stop keepalive
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

    Ok(Json(serde_json::json!({
        "session_id": session_id.to_string(),
    })))
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

/// Simple shell escaping: wrap in single quotes.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

