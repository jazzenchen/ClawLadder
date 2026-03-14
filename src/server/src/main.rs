use clawladder_core::logger::Logger;

#[tokio::main]
async fn main() {
    let logger = Logger::init().expect("Failed to initialize logger");

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3145);

    let dist_dir = clawladder_core::path_utils::find_web_dist();
    server::run_server(port, dist_dir, logger).await.unwrap_or_else(|e| {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    });
}
