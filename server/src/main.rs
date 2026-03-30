use std::sync::Arc;

use forme_server::config;
use forme_server::routes;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "forme_server=info,tower_http=info".into()),
        )
        .init();

    let config = config::Config::from_env();
    let port = config.http_port;

    if config.api_key.is_some() {
        tracing::info!("API key authentication enabled");
    } else {
        tracing::info!("No API key configured — all endpoints are open");
    }

    if let Some(ref dir) = config.templates_dir {
        if dir.is_dir() {
            tracing::info!(path = %dir.display(), "Template directory configured");
        } else {
            tracing::warn!(
                path = %dir.display(),
                "Template directory does not exist or is not a directory"
            );
        }
    }

    let config = Arc::new(config);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::router(config)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{port}");
    tracing::info!(
        "Forme server v{} listening on {addr}",
        env!("CARGO_PKG_VERSION")
    );

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
