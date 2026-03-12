//! Control the OpenClaw gateway via `openclaw gateway` CLI commands.
//!
//! All commands are run via `bash -lc "openclaw ..."` so the user's PATH is
//! available (Homebrew, nvm, etc.).
//!
//! We trust the JSON output from `openclaw gateway status --json` as the
//! single source of truth — no custom plist/systemd detection or TCP probing.

use serde::{Deserialize, Serialize};

/// Gateway status — a thin projection of `openclaw gateway status --json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayStatus {
    #[serde(default)]
    pub installed: bool,

    #[serde(default)]
    pub running: bool,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    #[serde(default)]
    pub rpc_ok: bool,

    /// Raw JSON from the command (for extra fields we don't model)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Run an openclaw command via login shell and return (stdout, stderr, success).
fn run_openclaw_cmd(args: &str) -> (String, String, bool) {
    let cmd = format!("openclaw {}", args);
    let mut command = std::process::Command::new("bash");
    command.args(["-lc", &cmd]);
    crate::path_utils::apply_rich_env(&mut command);
    match command.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            (stdout, stderr, output.status.success())
        }
        Err(e) => (String::new(), format!("Failed to run `{}`: {}", cmd, e), false),
    }
}

/// Run a simple lifecycle command (`gateway start/stop/restart/install/uninstall`)
/// and return Ok(stdout) or Err(message).
fn run_gateway_lifecycle(subcmd: &str) -> Result<String, String> {
    let (stdout, stderr, success) = run_openclaw_cmd(&format!("gateway {}", subcmd));
    if success {
        Ok(stdout)
    } else {
        let detail = if stderr.is_empty() { &stdout } else { &stderr };
        Err(format!("gateway {} failed: {}", subcmd, detail))
    }
}

/// Extract the first JSON object from stdout (skip any banner/warning lines).
fn extract_json(stdout: &str) -> Option<serde_json::Value> {
    let start = stdout.find('{')?;
    serde_json::from_str(&stdout[start..]).ok()
}

// ---------------------------------------------------------------------------
// Status — parse `openclaw gateway status --json`
// ---------------------------------------------------------------------------

fn parse_status_json(json: &serde_json::Value) -> GatewayStatus {
    let service = json.get("service");

    // installed: service loaded OR plist/unit path present in JSON
    let loaded = service
        .and_then(|s| s.get("loaded"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let has_source_path = service
        .and_then(|s| s.get("command"))
        .and_then(|c| c.get("sourcePath"))
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let installed = loaded || has_source_path;

    // running: service runtime says "running", OR rpc probe ok
    let runtime_running = service
        .and_then(|s| s.get("runtime"))
        .and_then(|r| r.get("status"))
        .and_then(|v| v.as_str())
        == Some("running");
    let rpc_ok = json
        .get("rpc")
        .and_then(|r| r.get("ok"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let running = runtime_running || rpc_ok;

    // pid: from service runtime, fallback to port listeners
    let pid = service
        .and_then(|s| s.get("runtime"))
        .and_then(|r| r.get("pid"))
        .and_then(|v| v.as_u64())
        .or_else(|| {
            json.get("port")
                .and_then(|p| p.get("listeners"))
                .and_then(|l| l.as_array())
                .and_then(|arr| arr.first())
                .and_then(|l| l.get("pid"))
                .and_then(|v| v.as_u64())
        })
        .map(|p| p as u32);

    let gw = json.get("gateway");
    let port = gw
        .and_then(|g| g.get("port"))
        .and_then(|v| v.as_u64())
        .map(|p| p as u16);
    let address = gw
        .and_then(|g| g.get("probeUrl"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    GatewayStatus {
        installed,
        running,
        pid,
        address,
        port,
        version: None,
        rpc_ok,
        raw: Some(json.clone()),
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// `openclaw gateway status --json`
pub fn gateway_status() -> GatewayStatus {
    let (stdout, _stderr, _success) = run_openclaw_cmd("gateway status --json");
    match extract_json(&stdout) {
        Some(val) => parse_status_json(&val),
        None => GatewayStatus::default(),
    }
}

/// `openclaw gateway install` — register as system service and start.
pub fn gateway_install() -> Result<String, String> {
    run_gateway_lifecycle("install")
}

/// Start the gateway as a managed service via `openclaw onboard`.
/// Skips all configuration steps — only registers and starts the gateway service.
pub fn gateway_start() -> Result<String, String> {
    let (stdout, stderr, success) = run_openclaw_cmd(
        "onboard --non-interactive --mode local --accept-risk \
         --auth-choice skip --install-daemon \
         --skip-channels --skip-skills --skip-search --skip-ui --skip-health"
    );
    if success {
        Ok(stdout)
    } else {
        let detail = if stderr.is_empty() { &stdout } else { &stderr };
        Err(format!("gateway start (onboard) failed: {}", detail))
    }
}

/// `openclaw gateway stop`
/// If the service manager can't stop it (e.g. manually started process),
/// falls back to killing the PID detected by `gateway status`.
pub fn gateway_stop() -> Result<String, String> {
    let _ = run_gateway_lifecycle("stop");
    // Check if it's still running (covers non-service-managed processes)
    let status = gateway_status();
    if status.running {
        if let Some(pid) = status.pid {
            match std::process::Command::new("kill").arg(pid.to_string()).output() {
                Ok(o) if o.status.success() => return Ok(format!("Gateway stopped (killed PID {})", pid)),
                _ => return Err(format!("gateway stop failed: could not kill PID {}", pid)),
            }
        }
        return Err("gateway stop failed: process still running but PID unknown".to_string());
    }
    Ok("Gateway stopped".to_string())
}

/// `openclaw gateway restart`
pub fn gateway_restart() -> Result<String, String> {
    run_gateway_lifecycle("restart --allow-unconfigured")
}

/// `openclaw gateway uninstall`
pub fn gateway_uninstall() -> Result<String, String> {
    run_gateway_lifecycle("uninstall")
}

/// `openclaw --version`
pub fn openclaw_version() -> Option<String> {
    let (stdout, _, success) = run_openclaw_cmd("--version");
    if success && !stdout.is_empty() {
        Some(stdout)
    } else {
        None
    }
}
