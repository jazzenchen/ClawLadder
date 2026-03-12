//! Shared PATH utilities for macOS GUI apps.
//!
//! macOS GUI apps inherit a minimal PATH from launchd that lacks Homebrew,
//! nvm, cargo, etc.  This module builds a "rich" PATH that includes common
//! tool directories so child processes can find `openclaw`, `node`, etc.

/// Build a PATH string that includes Homebrew, cargo, nvm, and other common
/// tool directories that are missing from the default GUI-app environment.
pub fn build_rich_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let base = std::env::var("PATH").unwrap_or_default();

    // Collect all candidate dirs in priority order (high → low).
    let mut candidates: Vec<String> = Vec::new();

    // Static well-known dirs
    candidates.push("/opt/homebrew/bin".into());
    candidates.push("/opt/homebrew/sbin".into());
    candidates.push("/usr/local/bin".into());
    candidates.push("/usr/local/sbin".into());
    candidates.push(format!("{}/.local/bin", home));
    candidates.push(format!("{}/.cargo/bin", home));

    // nvm: scan for installed node version bin dirs
    let nvm_dir =
        std::env::var("NVM_DIR").unwrap_or_else(|_| format!("{}/.nvm", home));
    let nvm_versions = format!("{}/versions/node", nvm_dir);
    if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
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

/// Apply the rich PATH (and HOME) to a `std::process::Command`.
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
