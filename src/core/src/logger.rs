//! Centralized logging for ClawLadder.
//!
//! Each run creates a single log file named by timestamp (e.g. `2026-03-11_143022.log`).
//! Application events go through `tracing` (with level/target prefixes).
//! PTY output is written directly via `Logger::pty()`.
//! Both share the same file, interleaved in order.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

const APP_DIR: &str = "com.jazzen.clawladder";
const LOG_SUBDIR: &str = "logs";

pub fn log_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join(APP_DIR).join(LOG_SUBDIR);
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Shared file handle used by both tracing and direct PTY writes.
type SharedFile = Arc<Mutex<fs::File>>;

#[derive(Clone)]
pub struct Logger {
    inner: SharedFile,
    path: PathBuf,
}

impl Logger {
    /// Create a new timestamped log file and install the global tracing subscriber.
    /// Call once at startup.
    pub fn init() -> Result<Self, std::io::Error> {
        let dir = log_dir();
        let filename = format!("{}.log", timestamp());
        let path = dir.join(&filename);
        let file = fs::File::create(&path)?;
        let inner: SharedFile = Arc::new(Mutex::new(file));

        let logger = Self {
            inner: inner.clone(),
            path,
        };

        // Install tracing subscriber that writes to the same file.
        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info"));

        let file_layer = SharedFileLayer { file: inner };

        let registry = tracing_subscriber::registry()
            .with(filter)
            .with(file_layer);

        #[cfg(debug_assertions)]
        let registry = registry.with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .with_target(true),
        );

        let _ = registry.try_init();

        tracing::info!(path = %logger.path.display(), "Log started");
        Ok(logger)
    }

    /// Write raw PTY output directly (ANSI stripped).
    pub fn pty(&self, data: &[u8]) {
        let text = String::from_utf8_lossy(data);
        let clean = strip_ansi(&text);
        if let Ok(mut f) = self.inner.lock() {
            let _ = f.write_all(clean.as_bytes());
            let _ = f.flush();
        }
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }
}

// --- Custom tracing Layer that writes formatted events to our shared file ---

use tracing::{Event, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

struct SharedFileLayer {
    file: SharedFile,
}

impl<S: Subscriber> Layer<S> for SharedFileLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        use std::fmt::Write as FmtWrite;
        let meta = event.metadata();
        let mut msg = String::new();
        let _ = write!(msg, "[{}] [{}] ", meta.level(), meta.target());

        // Extract the message field from the event.
        struct MsgVisitor<'a>(&'a mut String);
        impl tracing::field::Visit for MsgVisitor<'_> {
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
                if field.name() == "message" {
                    let _ = write!(self.0, "{:?}", value);
                } else {
                    let _ = write!(self.0, " {}={:?}", field.name(), value);
                }
            }
            fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
                if field.name() == "message" {
                    self.0.push_str(value);
                } else {
                    let _ = write!(self.0, " {}={}", field.name(), value);
                }
            }
        }
        event.record(&mut MsgVisitor(&mut msg));

        if let Ok(mut f) = self.file.lock() {
            let _ = writeln!(f, "{}", msg);
            let _ = f.flush();
        }
    }
}

// --- ANSI stripping ---

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        chars.next();
                        if ('\x40'..='\x7e').contains(&ch) { break; }
                    }
                }
                Some(']') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        if ch == '\x07' { chars.next(); break; }
                        if ch == '\x1b' {
                            chars.next();
                            if chars.peek() == Some(&'\\') { chars.next(); }
                            break;
                        }
                        chars.next();
                    }
                }
                _ => { chars.next(); }
            }
        } else if c == '\r' {
            continue;
        } else {
            out.push(c);
        }
    }
    out
}

// --- Timestamp ---

fn timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let secs_per_day = 86400u64;
    let days = now / secs_per_day;
    let day_secs = now % secs_per_day;
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    let (y, mo, d) = civil_from_days(days as i64);
    format!("{:04}-{:02}-{:02}_{:02}{:02}{:02}", y, mo, d, h, m, s)
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
