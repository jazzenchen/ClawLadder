#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clawladder_core::logger::Logger;
use std::path::PathBuf;

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

fn main() {
    // Init logger first — everything from here on gets logged.
    let logger = Logger::init().expect("Failed to initialize logger");

    // Start the HTTP server in a background thread
    let server_logger = logger.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let dist_dir = find_web_dist();
        rt.block_on(server::run_server(3145, dist_dir, server_logger));
    });

    // Small delay to let server bind
    std::thread::sleep(std::time::Duration::from_millis(300));

    tracing::info!("Starting Tauri application");

    // Run Tauri app (blocks until window closes)
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    tracing::info!("Application shutting down");
}

fn find_web_dist() -> PathBuf {
    // Inside .app bundle: Contents/Resources/web/dist
    if let Ok(exe) = std::env::current_exe() {
        if let Some(macos_dir) = exe.parent() {
            let resources = macos_dir.join("../Resources/web/dist");
            if resources.exists() {
                return resources;
            }
        }
    }
    // Fallback for dev
    let candidates = [
        PathBuf::from("../web/dist"),
        PathBuf::from("web/dist"),
    ];
    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }
    PathBuf::from("../web/dist")
}
