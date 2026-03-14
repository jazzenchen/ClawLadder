#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clawladder_core::logger::Logger;

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// In dev: load from Vite (localhost:5173). In build: load from server (hosts static dist).
fn main_window_url() -> tauri::WebviewUrl {
    let url_str = if cfg!(debug_assertions) {
        "http://localhost:5173"
    } else {
        "http://127.0.0.1:3145"
    };
    tauri::WebviewUrl::External(
        tauri::Url::parse(url_str).expect("invalid main window URL"),
    )
}

fn main() {
    // Init logger first — everything from here on gets logged.
    let logger = Logger::init().expect("Failed to initialize logger");

    // Start the HTTP server in a background thread (API + in build serves static dist)
    let server_logger = logger.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let dist_dir = clawladder_core::path_utils::find_web_dist();
        if let Err(e) = rt.block_on(server::run_server(3145, dist_dir, server_logger)) {
            tracing::error!("Server failed to start: {}", e);
            eprintln!("Server error: {}", e);
        }
    });

    // Small delay to let server bind
    std::thread::sleep(std::time::Duration::from_millis(300));

    tracing::info!("Starting Tauri application");

    // Run Tauri app (blocks until window closes)
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_url])
        .setup(|app| {
            let win_config = &app.config().app.windows[0];
            let url = main_window_url();
            tauri::WebviewWindowBuilder::new(app.handle(), "main", url)
                .title(&win_config.title)
                .inner_size(win_config.width, win_config.height)
                .resizable(win_config.resizable)
                .decorations(win_config.decorations)
                .fullscreen(win_config.fullscreen)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    tracing::info!("Application shutting down");
}
