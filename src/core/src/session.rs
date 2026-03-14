//! Session registry: persistent PTY sessions with scrollback buffer and live broadcast.

use crate::pty::{PtyBridge, ResizeSender};
use bytes::Bytes;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct SessionId(pub uuid::Uuid);

impl SessionId {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}

impl std::fmt::Display for SessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// Fixed-capacity circular scrollback buffer (bytes).
const SCROLLBACK_CAP: usize = 2 * 1024 * 1024; // 2 MiB

use std::collections::VecDeque;

pub struct CircularBuffer {
    data: std::sync::Mutex<VecDeque<u8>>,
}

impl CircularBuffer {
    pub fn new() -> Self {
        Self {
            data: std::sync::Mutex::new(VecDeque::new()),
        }
    }

    pub fn push(&self, bytes: &[u8]) {
        let mut g = self.data.lock().expect("buffer mutex");
        g.extend(bytes.iter().copied());
        if g.len() > SCROLLBACK_CAP {
            let excess = g.len() - SCROLLBACK_CAP;
            drop(g.drain(..excess));
        }
    }

    pub fn dump(&self) -> Vec<u8> {
        let g = self.data.lock().expect("buffer mutex");
        g.iter().copied().collect()
    }
}

pub const LIVE_BROADCAST_CAP: usize = 256;

pub struct SessionContext {
    pub bridge: PtyBridge,
    pub resize_tx: ResizeSender,
    pub buffer: Arc<CircularBuffer>,
    pub live_tx: broadcast::Sender<Bytes>,
}

pub type Registry = Arc<DashMap<SessionId, SessionContext>>;
