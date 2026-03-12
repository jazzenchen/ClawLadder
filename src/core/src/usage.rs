//! Scan OpenClaw session JSONL files and aggregate token usage
//! by day, agent, provider, and model.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UsageStats {
    /// Per-day totals, sorted newest first
    pub daily: Vec<DailyUsage>,
    /// Breakdown by agent
    pub by_agent: Vec<GroupedUsage>,
    /// Breakdown by provider
    pub by_provider: Vec<GroupedUsage>,
    /// Breakdown by model
    pub by_model: Vec<GroupedUsage>,
    /// Grand totals
    pub totals: UsageTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DailyUsage {
    pub date: String, // "YYYY-MM-DD"
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GroupedUsage {
    pub key: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UsageTotals {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub cost: f64,
    pub requests: u64,
    pub sessions_scanned: u64,
    pub days: u64,
}

// ---------------------------------------------------------------------------
// Internal: JSONL line shape (only the fields we need)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct JLine {
    #[serde(rename = "type")]
    ty: Option<String>,
    message: Option<JMessage>,
}

#[derive(Deserialize)]
struct JMessage {
    role: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    usage: Option<JUsage>,
    timestamp: Option<serde_json::Value>, // epoch ms (number) or ISO string
}

#[derive(Deserialize)]
struct JUsage {
    input: Option<u64>,
    output: Option<u64>,
    #[serde(rename = "totalTokens")]
    total_tokens: Option<u64>,
    #[serde(rename = "cacheRead")]
    cache_read: Option<u64>,
    #[serde(rename = "cacheWrite")]
    cache_write: Option<u64>,
    cost: Option<JCost>,
}

#[derive(Deserialize)]
struct JCost {
    total: Option<f64>,
}

// ---------------------------------------------------------------------------
// Session-level header (first line of JSONL, type=session)
// ---------------------------------------------------------------------------

// (reserved for future use — e.g. extracting session-level metadata)

// ---------------------------------------------------------------------------
// Core scan logic
// ---------------------------------------------------------------------------

/// Scan `~/.openclaw/agents/*/sessions/*.jsonl` and return aggregated stats.
/// `lookback_days`: only include data from the last N days (0 = all).
pub fn scan_usage(lookback_days: u32) -> UsageStats {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return UsageStats::default(),
    };

    let agents_dir = PathBuf::from(format!("{}/.openclaw/agents", home));
    if !agents_dir.exists() {
        return UsageStats::default();
    }

    // Determine cutoff date string "YYYY-MM-DD" if lookback > 0
    let cutoff_date = if lookback_days > 0 {
        cutoff_date_str(lookback_days)
    } else {
        None
    };

    let mut daily_map: HashMap<String, DailyUsage> = HashMap::new();
    let mut agent_map: HashMap<String, GroupedUsage> = HashMap::new();
    let mut provider_map: HashMap<String, GroupedUsage> = HashMap::new();
    let mut model_map: HashMap<String, GroupedUsage> = HashMap::new();
    let mut totals = UsageTotals::default();

    // Walk agents
    let agent_entries = match std::fs::read_dir(&agents_dir) {
        Ok(e) => e,
        Err(_) => return UsageStats::default(),
    };

    for agent_entry in agent_entries.flatten() {
        let agent_id = agent_entry.file_name().to_string_lossy().to_string();
        let sessions_dir = agent_entry.path().join("sessions");
        if !sessions_dir.is_dir() {
            continue;
        }

        let session_files = match std::fs::read_dir(&sessions_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for file_entry in session_files.flatten() {
            let path = file_entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }

            // Quick mtime check: skip files older than lookback window
            if cutoff_date.is_some() {
                if let Ok(meta) = std::fs::metadata(&path) {
                    if let Ok(modified) = meta.modified() {
                        let age = std::time::SystemTime::now()
                            .duration_since(modified)
                            .unwrap_or_default();
                        if age.as_secs() > (lookback_days as u64 + 1) * 86400 {
                            continue;
                        }
                    }
                }
            }

            let contents = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            totals.sessions_scanned += 1;

            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                let parsed: JLine = match serde_json::from_str(line) {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                if parsed.ty.as_deref() != Some("message") {
                    continue;
                }

                let msg = match parsed.message {
                    Some(m) => m,
                    None => continue,
                };

                if msg.role.as_deref() != Some("assistant") {
                    continue;
                }

                let usage = match msg.usage {
                    Some(u) => u,
                    None => continue,
                };

                let input = usage.input.unwrap_or(0);
                let output = usage.output.unwrap_or(0);
                let total = usage.total_tokens.unwrap_or(input + output);
                let cache_r = usage.cache_read.unwrap_or(0);
                let cache_w = usage.cache_write.unwrap_or(0);
                let cost = usage.cost.as_ref().and_then(|c| c.total).unwrap_or(0.0);

                // Extract date from timestamp
                let date = extract_date_from_timestamp(&msg.timestamp);
                let date = match date {
                    Some(d) => d,
                    None => continue,
                };

                // Apply cutoff
                if let Some(ref cutoff) = cutoff_date {
                    if date.as_str() < cutoff.as_str() {
                        continue;
                    }
                }

                let provider = msg.provider.unwrap_or_else(|| "unknown".into());
                let model = msg.model.unwrap_or_else(|| "unknown".into());

                // Daily
                let day = daily_map.entry(date.clone()).or_insert_with(|| DailyUsage {
                    date: date.clone(),
                    ..Default::default()
                });
                day.input_tokens += input;
                day.output_tokens += output;
                day.total_tokens += total;
                day.cache_read += cache_r;
                day.cache_write += cache_w;
                day.cost += cost;
                day.requests += 1;

                // Agent
                let ag = agent_map.entry(agent_id.clone()).or_insert_with(|| GroupedUsage {
                    key: agent_id.clone(),
                    ..Default::default()
                });
                ag.input_tokens += input;
                ag.output_tokens += output;
                ag.total_tokens += total;
                ag.cost += cost;
                ag.requests += 1;

                // Provider
                let pv = provider_map.entry(provider.clone()).or_insert_with(|| GroupedUsage {
                    key: provider.clone(),
                    ..Default::default()
                });
                pv.input_tokens += input;
                pv.output_tokens += output;
                pv.total_tokens += total;
                pv.cost += cost;
                pv.requests += 1;

                // Model
                let md = model_map.entry(model.clone()).or_insert_with(|| GroupedUsage {
                    key: model.clone(),
                    ..Default::default()
                });
                md.input_tokens += input;
                md.output_tokens += output;
                md.total_tokens += total;
                md.cost += cost;
                md.requests += 1;

                // Totals
                totals.input_tokens += input;
                totals.output_tokens += output;
                totals.total_tokens += total;
                totals.cache_read += cache_r;
                totals.cache_write += cache_w;
                totals.cost += cost;
                totals.requests += 1;
            }
        }
    }

    // Sort daily newest first
    let mut daily: Vec<DailyUsage> = daily_map.into_values().collect();
    daily.sort_by(|a, b| b.date.cmp(&a.date));
    totals.days = daily.len() as u64;

    // Sort breakdowns by total_tokens descending
    let mut by_agent: Vec<GroupedUsage> = agent_map.into_values().collect();
    by_agent.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    let mut by_provider: Vec<GroupedUsage> = provider_map.into_values().collect();
    by_provider.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    let mut by_model: Vec<GroupedUsage> = model_map.into_values().collect();
    by_model.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    UsageStats {
        daily,
        by_agent,
        by_provider,
        by_model,
        totals,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract "YYYY-MM-DD" from a timestamp value (epoch ms number or ISO string).
fn extract_date_from_timestamp(ts: &Option<serde_json::Value>) -> Option<String> {
    match ts {
        Some(serde_json::Value::Number(n)) => {
            // Epoch milliseconds → convert to date
            let ms = n.as_u64()?;
            let secs = ms / 1000;
            // Simple UTC date from epoch: days since 1970-01-01
            epoch_secs_to_date(secs)
        }
        Some(serde_json::Value::String(s)) => {
            // ISO "2026-03-12T18:53:42.236Z" → take first 10 chars
            if s.len() >= 10 {
                Some(s[..10].to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Convert epoch seconds to "YYYY-MM-DD" (UTC). Simple civil-date calculation.
fn epoch_secs_to_date(secs: u64) -> Option<String> {
    // Days since 1970-01-01
    let days = (secs / 86400) as i64;
    // Algorithm from Howard Hinnant's date library (civil_from_days)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    Some(format!("{:04}-{:02}-{:02}", y, m, d))
}

/// Get the cutoff date string "YYYY-MM-DD" for N days ago.
fn cutoff_date_str(days: u32) -> Option<String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?;
    let cutoff_secs = now.as_secs().saturating_sub(days as u64 * 86400);
    epoch_secs_to_date(cutoff_secs)
}
