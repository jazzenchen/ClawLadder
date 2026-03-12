//! Portable PTY: spawn a shell and bridge stdin/stdout for xterm ↔ WebSocket.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{self, Arc, Mutex};
use tokio::sync::mpsc;

/// Sender to request PTY resize (cols, rows).
pub type ResizeSender = sync::mpsc::Sender<(u16, u16)>;

/// PTY bridge: writer for stdin, child kept alive.
pub struct PtyBridge {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

impl PtyBridge {
    pub fn kill(&self) -> Result<(), std::io::Error> {
        let mut guard = self
            .child
            .lock()
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "child mutex poisoned"))?;
        guard.kill()
    }

    /// Wait for the child process to exit and return its exit code.
    pub fn wait_exit_code(&self) -> Option<u32> {
        let mut guard = self.child.lock().ok()?;
        let status = guard.wait().ok()?;
        Some(status.exit_code())
    }
}

/// Spawn a shell in a PTY. Returns bridge, stdout receiver, and resize sender.
pub fn spawn_pty() -> Result<
    (PtyBridge, mpsc::Receiver<Vec<u8>>, ResizeSender),
    Box<dyn std::error::Error + Send + Sync>,
> {
    let mut cmd = shell_command();
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    inherit_env(&mut cmd);
    spawn_pty_with_cmd(cmd)
}

/// Spawn a specific command in a PTY. Returns bridge, stdout receiver, and resize sender.
pub fn spawn_pty_cmd(program: &str, args: &[&str]) -> Result<
    (PtyBridge, mpsc::Receiver<Vec<u8>>, ResizeSender),
    Box<dyn std::error::Error + Send + Sync>,
> {
    let mut cmd = CommandBuilder::new(program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    inherit_env(&mut cmd);
    spawn_pty_with_cmd(cmd)
}

fn inherit_env(cmd: &mut CommandBuilder) {
    crate::path_utils::apply_rich_env_pty(cmd);
}

fn spawn_pty_with_cmd(cmd: CommandBuilder) -> Result<
    (PtyBridge, mpsc::Receiver<Vec<u8>>, ResizeSender),
    Box<dyn std::error::Error + Send + Sync>,
> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;
    let master = pair.master;

    let (tx, rx) = mpsc::channel::<Vec<u8>>(256);
    let (resize_tx, resize_rx) = sync::mpsc::channel::<(u16, u16)>();

    let child = Arc::new(Mutex::new(child));
    let writer = Arc::new(Mutex::new(writer));

    // Reader thread: PTY stdout → channel
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Resize thread: receives (cols, rows) and calls master.resize()
    std::thread::spawn(move || {
        while let Ok((cols, rows)) = resize_rx.recv() {
            let _ = master.resize(PtySize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    });

    let bridge = PtyBridge { writer, child };
    Ok((bridge, rx, resize_tx))
}

#[cfg(unix)]
fn shell_command() -> CommandBuilder {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut c = CommandBuilder::new(&shell);
    c.arg("-l");
    c
}

#[cfg(windows)]
fn shell_command() -> CommandBuilder {
    CommandBuilder::new("cmd.exe")
}
