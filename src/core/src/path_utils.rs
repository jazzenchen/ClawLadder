//! Shared PATH utilities for macOS GUI apps.
//!
//! macOS GUI apps inherit a minimal PATH from launchd that lacks Homebrew,
//! nvm, fnm, volta, asdf, mise, bun, nix, etc.  This module builds a "rich"
//! PATH that includes common tool directories so child processes can find
//! `openclaw`, `node`, etc.
//!
//! It also provides helpers to persist / retrieve the resolved `openclaw`
//! binary path so we don't rely on PATH resolution after the first install.

use std::path::Path;

// ---------------------------------------------------------------------------
// Saved binary path (persisted in ~/.openclaw/clawladder.json)
// ---------------------------------------------------------------------------

/// Read the saved `openclaw` binary path from `~/.openclaw/clawladder.json`.
/// Returns `None` if the file doesn't exist, can't be parsed, or the key is
/// missing.
pub fn read_saved_bin_path() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let config = format!("{}/.openclaw/clawladder.json", home);
    let contents = std::fs::read_to_string(config).ok()?;
    let val: serde_json::Value = serde_json::from_str(&contents).ok()?;
    val.get("openclaw_bin")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty() && Path::new(s).exists())
        .map(|s| s.to_string())
}

/// Save the `openclaw` binary path into `~/.openclaw/clawladder.json`,
/// merging with any existing keys (e.g. `status`).
pub fn save_bin_path(bin_path: &str) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "Cannot determine HOME".to_string())?;
    let dir = format!("{}/.openclaw", home);
    let config_path = format!("{}/clawladder.json", dir);

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create dir: {}", e))?;

    // Read existing content and merge
    let mut val: serde_json::Value = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    val.as_object_mut()
        .ok_or_else(|| "clawladder.json is not an object".to_string())?
        .insert("openclaw_bin".to_string(), serde_json::json!(bin_path));

    let json = serde_json::to_string_pretty(&val)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write clawladder.json: {}", e))?;

    tracing::info!(path = %bin_path, "Saved openclaw binary path");
    Ok(())
}

/// Resolve the `openclaw` binary to use.
///
/// Priority:
/// 1. Saved absolute path in `~/.openclaw/clawladder.json` (if file still exists)
/// 2. Probe via the user's login shell: `$SHELL -lc "which openclaw"`
/// 3. Fallback: bare `"openclaw"` (rely on rich PATH)
pub fn resolve_openclaw_bin() -> String {
    // 1. Saved path
    if let Some(saved) = read_saved_bin_path() {
        tracing::debug!(path = %saved, "Using saved openclaw binary path");
        return saved;
    }

    // 2. Probe via user's login shell
    if let Some(probed) = probe_openclaw_via_shell() {
        tracing::debug!(path = %probed, "Probed openclaw binary via login shell");
        // Persist for next time
        let _ = save_bin_path(&probed);
        return probed;
    }

    // 3. Bare fallback
    tracing::debug!("Falling back to bare 'openclaw' (relying on rich PATH)");
    "openclaw".to_string()
}

/// Use the user's default shell (`$SHELL`) as a login shell to locate openclaw.
fn probe_openclaw_via_shell() -> Option<String> {
    let shell = user_shell();
    let mut cmd = std::process::Command::new(&shell);
    cmd.args(["-lc", "which openclaw"]);
    apply_rich_env(&mut cmd);
    match cmd.output() {
        Ok(o) if o.status.success() => {
            let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                Some(path)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Return the user's default shell, falling back to `/bin/zsh` on macOS.
pub fn user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    })
}

// ---------------------------------------------------------------------------
// Rich PATH builder
// ---------------------------------------------------------------------------

/// Build a PATH string that includes Homebrew, cargo, nvm, fnm, volta, asdf,
/// mise, bun, nix, and other common tool directories that are missing from the
/// default GUI-app environment.
pub fn build_rich_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let base = std::env::var("PATH").unwrap_or_default();

    // Collect all candidate dirs in priority order (high → low).
    let mut candidates: Vec<String> = Vec::new();

    // --- Static well-known dirs ---
    candidates.push("/opt/homebrew/bin".into());
    candidates.push("/opt/homebrew/sbin".into());
    candidates.push("/usr/local/bin".into());
    candidates.push("/usr/local/sbin".into());
    candidates.push(format!("{}/.clawladder/node/bin", home)); // ClawLadder installs openclaw here
    candidates.push(format!("{}/.local/bin", home));
    candidates.push(format!("{}/.cargo/bin", home));

    // --- nvm ---
    let nvm_dir =
        std::env::var("NVM_DIR").unwrap_or_else(|_| format!("{}/.nvm", home));
    scan_node_version_bins(&format!("{}/versions/node", nvm_dir), &mut candidates);

    // --- fnm ---
    // fnm stores versions in ~/.fnm/node-versions/vXX/installation/bin
    // or on macOS in ~/Library/Application Support/fnm/node-versions/...
    let fnm_dirs = [
        format!("{}/.fnm/node-versions", home),
        format!("{}/Library/Application Support/fnm/node-versions", home),
    ];
    for fnm_base in &fnm_dirs {
        if let Ok(entries) = std::fs::read_dir(fnm_base) {
            let mut bins: Vec<String> = entries
                .flatten()
                .filter_map(|entry| {
                    let bin = entry.path().join("installation/bin");
                    if bin.exists() {
                        Some(bin.to_string_lossy().into_owned())
                    } else {
                        None
                    }
                })
                .collect();
            bins.sort();
            bins.reverse();
            candidates.extend(bins);
        }
    }

    // --- volta ---
    candidates.push(format!("{}/.volta/bin", home));

    // --- asdf ---
    let asdf_dir =
        std::env::var("ASDF_DATA_DIR").unwrap_or_else(|_| format!("{}/.asdf", home));
    candidates.push(format!("{}/shims", asdf_dir));
    scan_node_version_bins(&format!("{}/installs/nodejs", asdf_dir), &mut candidates);

    // --- mise (formerly rtx) ---
    let mise_dir = std::env::var("MISE_DATA_DIR").unwrap_or_else(|_| {
        format!("{}/.local/share/mise", home)
    });
    candidates.push(format!("{}/shims", mise_dir));
    scan_node_version_bins(&format!("{}/installs/node", mise_dir), &mut candidates);

    // --- bun ---
    candidates.push(format!("{}/.bun/bin", home));

    // --- nix ---
    candidates.push(format!("{}/.nix-profile/bin", home));
    candidates.push("/nix/var/nix/profiles/default/bin".into());
    candidates.push("/run/current-system/sw/bin".into());

    // --- n (tj/n) ---
    let n_prefix = std::env::var("N_PREFIX").unwrap_or_else(|_| "/usr/local".into());
    candidates.push(format!("{}/bin", n_prefix));

    // Append existing PATH entries
    for segment in base.split(':') {
        if !segment.is_empty() {
            candidates.push(segment.to_string());
        }
    }

    // Deduplicate while preserving order
    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<String> = Vec::new();
    for dir in candidates {
        if seen.insert(dir.clone()) {
            result.push(dir);
        }
    }

    result.join(":")
}

/// Scan a directory of node version directories (e.g. `~/.nvm/versions/node`)
/// and push each `<version>/bin` into candidates, newest first.
fn scan_node_version_bins(versions_dir: &str, candidates: &mut Vec<String>) {
    if let Ok(entries) = std::fs::read_dir(versions_dir) {
        let mut version_bins: Vec<String> = entries
            .flatten()
            .filter_map(|entry| {
                let bin = entry.path().join("bin");
                if bin.exists() {
                    Some(bin.to_string_lossy().into_owned())
                } else {
                    None
                }
            })
            .collect();
        // Sort descending so the newest node version comes first
        version_bins.sort();
        version_bins.reverse();
        candidates.extend(version_bins);
    }
}

/// Apply the rich PATH (and HOME / NVM_DIR) to a `std::process::Command`.
pub fn apply_rich_env(cmd: &mut std::process::Command) {
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", &home);
    }
    cmd.env("PATH", build_rich_path());
    // Forward NVM_DIR so nvm-based scripts work
    if let Ok(nvm_dir) = std::env::var("NVM_DIR") {
        cmd.env("NVM_DIR", nvm_dir);
    }
}

/// Apply the rich PATH to a `portable_pty::CommandBuilder`.
pub fn apply_rich_env_pty(cmd: &mut portable_pty::CommandBuilder) {
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", &home);
    }
    cmd.env("PATH", build_rich_path());
    if let Ok(nvm_dir) = std::env::var("NVM_DIR") {
        cmd.env("NVM_DIR", nvm_dir);
    }
}

/// Locate the `web/dist` directory containing the front-end assets.
///
/// Search order:
/// 1. Inside a macOS `.app` bundle: `<exe>/../Resources/web/dist`
/// 2. `web/dist` relative to CWD
/// 3. `../web/dist` relative to CWD
/// 4. Fallback: `web/dist`
pub fn find_web_dist() -> std::path::PathBuf {
    use std::path::PathBuf;

    // Inside .app bundle: Contents/MacOS/../Resources/web/dist
    if let Ok(exe) = std::env::current_exe() {
        if let Some(macos_dir) = exe.parent() {
            let resources = macos_dir.join("../Resources/web/dist");
            if resources.exists() {
                return resources;
            }
        }
    }
    let candidates = [PathBuf::from("web/dist"), PathBuf::from("../web/dist")];
    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }
    PathBuf::from("web/dist")
}
