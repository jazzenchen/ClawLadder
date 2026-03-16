//! Scan OpenClaw session JSONL files and aggregate token usage
//! by day, agent, provider, and model.

use chrono::Timelike;
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
    /// Per-hour totals (populated when lookback_days <= 1), sorted by hour asc
    pub hourly: Vec<HourlyUsage>,
    /// Breakdown by agent
    pub by_agent: Vec<GroupedUsage>,
    /// Breakdown by provider
    pub by_provider: Vec<GroupedUsage>,
    /// Breakdown by model
    pub by_model: Vec<GroupedUsage>,
    /// Individual request records, sorted newest first
    pub records: Vec<UsageRecord>,
    /// Grand totals
    pub totals: UsageTotals,
}

/// A single token-usage record from one assistant response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecord {
    /// ISO timestamp or epoch ms string
    pub timestamp: String,
    /// Agent id (from directory name)
    pub agent_id: String,
    /// Session id (from JSONL filename, without extension)
    pub session_id: String,
    /// Model name, e.g. "claude-sonnet-4-20250514"
    pub model: String,
    /// Provider name, e.g. "anthropic"
    pub provider: String,
    /// Input tokens
    pub input_tokens: u64,
    /// Output tokens
    pub output_tokens: u64,
    /// Cache read tokens
    pub cache_read: u64,
    /// Cache write tokens
    pub cache_write: u64,
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
pub struct HourlyUsage {
    pub hour: String, // "HH:MM" (15-min bucket, e.g. "05:15")
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
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
    let mut hourly_map: HashMap<String, HourlyUsage> = HashMap::new();
    let mut agent_map: HashMap<String, GroupedUsage> = HashMap::new();
    let mut provider_map: HashMap<String, GroupedUsage> = HashMap::new();
    let mut model_map: HashMap<String, GroupedUsage> = HashMap::new();
    let mut records: Vec<UsageRecord> = Vec::new();
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

            let session_id = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

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

                // Collect individual record
                let ts_str = match &msg.timestamp {
                    Some(serde_json::Value::Number(n)) => n.to_string(),
                    Some(serde_json::Value::String(s)) => s.clone(),
                    _ => date.clone(),
                };
                records.push(UsageRecord {
                    timestamp: ts_str,
                    agent_id: agent_id.clone(),
                    session_id: session_id.clone(),
                    model: model.clone(),
                    provider: provider.clone(),
                    input_tokens: input,
                    output_tokens: output,
                    cache_read: cache_r,
                    cache_write: cache_w,
                });

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

                // Hourly (only when lookback <= 1 day)
                if lookback_days <= 1 {
                    let hour_key = extract_quarter_from_timestamp(&msg.timestamp)
                        .unwrap_or_else(|| "00:00".to_string());
                    let hr = hourly_map.entry(hour_key.clone()).or_insert_with(|| HourlyUsage {
                        hour: hour_key,
                        ..Default::default()
                    });
                    hr.input_tokens += input;
                    hr.output_tokens += output;
                    hr.total_tokens += total;
                    hr.requests += 1;
                }

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

    // Build hourly: fill all 96 quarter-hour slots so the chart shows 00:00–23:45
    let hourly: Vec<HourlyUsage> = if lookback_days <= 1 {
        (0..96)
            .map(|i| {
                let h = i / 4;
                let m = (i % 4) * 15;
                let key = format!("{:02}:{:02}", h, m);
                hourly_map.remove(&key).unwrap_or(HourlyUsage {
                    hour: key,
                    ..Default::default()
                })
            })
            .collect()
    } else {
        Vec::new()
    };

    // Sort records newest first (by timestamp descending)
    records.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Sort breakdowns by total_tokens descending
    let mut by_agent: Vec<GroupedUsage> = agent_map.into_values().collect();
    by_agent.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    let mut by_provider: Vec<GroupedUsage> = provider_map.into_values().collect();
    by_provider.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    let mut by_model: Vec<GroupedUsage> = model_map.into_values().collect();
    by_model.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    UsageStats {
        daily,
        hourly,
        by_agent,
        by_provider,
        by_model,
        records,
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

/// Convert epoch seconds to "YYYY-MM-DD" (UTC).
fn epoch_secs_to_date(secs: u64) -> Option<String> {
    crate::date_utils::epoch_secs_to_date(secs)
}

/// Extract "HH:MM" (15-min bucket) from a timestamp value (epoch ms or ISO string), using local time.
fn extract_quarter_from_timestamp(ts: &Option<serde_json::Value>) -> Option<String> {
    match ts {
        Some(serde_json::Value::Number(n)) => {
            let ms = n.as_u64()?;
            let secs = (ms / 1000) as i64;
            epoch_secs_to_local_quarter(secs)
        }
        Some(serde_json::Value::String(s)) => {
            if let Ok(d) = chrono::DateTime::parse_from_rfc3339(s) {
                let local = d.with_timezone(&chrono::Local);
                let q = local.minute() / 15 * 15;
                Some(format!("{:02}:{:02}", local.hour(), q))
            } else if s.len() >= 16 {
                // Fallback: "YYYY-MM-DDTHH:MM:..." → round minute to quarter
                let hh: u32 = s[11..13].parse().unwrap_or(0);
                let mm: u32 = s[14..16].parse().unwrap_or(0);
                let q = mm / 15 * 15;
                Some(format!("{:02}:{:02}", hh, q))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Convert epoch seconds to local "HH:MM" (15-min bucket).
fn epoch_secs_to_local_quarter(epoch_secs: i64) -> Option<String> {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_opt(epoch_secs, 0)
        .single()
        .map(|dt| {
            let q = dt.minute() / 15 * 15;
            format!("{:02}:{:02}", dt.hour(), q)
        })
}

/// Get the cutoff date string "YYYY-MM-DD" for N days ago.
fn cutoff_date_str(days: u32) -> Option<String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?;
    let cutoff_secs = now.as_secs().saturating_sub(days as u64 * 86400);
    epoch_secs_to_date(cutoff_secs)
}
