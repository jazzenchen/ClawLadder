//! Read / write ~/.openclaw/openclaw.json — the OpenClaw configuration file.
//!
//! The config is a JSON object with provider/model settings, IM channels, and skills.
//! We keep the serde model intentionally loose (serde_json::Value for extensible
//! sub-objects) so we don't break when OpenClaw adds new fields.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Top-level OpenClaw configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawConfig {
    /// Model provider settings (e.g. openai, anthropic, ollama …)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub providers: Vec<ProviderConfig>,

    /// IM channel integrations (e.g. slack, discord, telegram …)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub channels: Vec<ChannelConfig>,

    /// Enabled skill names / paths
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<String>,

    /// Catch-all for unknown top-level keys so we never lose data on round-trip.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// e.g. "openai", "anthropic", "ollama"
    pub provider: String,

    /// API base URL (optional — uses provider default if omitted)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,

    /// API key (may be empty for local providers like ollama)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,

    /// Model identifier, e.g. "gpt-4o", "claude-sonnet-4-20250514"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Whether this is the default / active provider
    #[serde(default)]
    pub default: bool,

    /// Extra provider-specific fields
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelConfig {
    /// Channel type: "slack", "discord", "telegram", etc.
    #[serde(rename = "type")]
    pub channel_type: String,

    /// Channel-specific settings (token, webhook URL, chat ID, etc.)
    #[serde(flatten)]
    pub settings: serde_json::Map<String, serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// Returns `~/.openclaw/`
pub fn openclaw_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".openclaw"))
}

/// Returns `~/.openclaw/openclaw.json`
pub fn config_path() -> Option<PathBuf> {
    openclaw_dir().map(|d| d.join("openclaw.json"))
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/// Read the config file. Returns `Ok(None)` if the file doesn't exist yet.
pub fn read_config() -> Result<Option<OpenClawConfig>, String> {
    let path = config_path().ok_or("Cannot determine home directory")?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let cfg: OpenClawConfig = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?;
    Ok(Some(cfg))
}

/// Write the config file, creating `~/.openclaw/` if needed.
pub fn write_config(cfg: &OpenClawConfig) -> Result<(), String> {
    let dir = openclaw_dir().ok_or("Cannot determine home directory")?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }
    let path = dir.join("openclaw.json");
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(())
}

/// Read the raw JSON value (for returning to the frontend as-is).
pub fn read_config_raw() -> Result<Option<serde_json::Value>, String> {
    let path = config_path().ok_or("Cannot determine home directory")?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let val: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?;
    Ok(Some(val))
}

/// Write raw JSON value to the config file.
pub fn write_config_raw(val: &serde_json::Value) -> Result<(), String> {
    let dir = openclaw_dir().ok_or("Cannot determine home directory")?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }
    let path = dir.join("openclaw.json");
    let json = serde_json::to_string_pretty(val)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(())
}
