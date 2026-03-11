use clawladder_core::logger::Logger;
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let logger = Logger::init().expect("Failed to initialize logger");

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3145);

    let dist_dir = find_web_dist();
    server::run_server(port, dist_dir, logger).await;
}

fn find_web_dist() -> PathBuf {
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
