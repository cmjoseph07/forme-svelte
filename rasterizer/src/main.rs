use std::io::Cursor;

use axum::{
    extract::DefaultBodyLimit,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::Engine as _;
use image::ImageFormat;
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

#[derive(Deserialize)]
struct RasterizeRequest {
    /// Base64-encoded PDF bytes.
    pdf: String,
    /// DPI for rasterization. Default 150, clamped to 72..=300.
    dpi: Option<u32>,
}

#[derive(Serialize)]
struct RasterizeResponse {
    /// Base64-encoded PNG images, one per page.
    pages: Vec<String>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn rasterize(
    Json(payload): Json<RasterizeRequest>,
) -> Result<Json<RasterizeResponse>, AppError> {
    let b64 = base64::engine::general_purpose::STANDARD;

    let pdf_bytes = b64
        .decode(&payload.pdf)
        .map_err(|e| AppError::bad_request(format!("Invalid base64 PDF: {e}")))?;

    let dpi = payload.dpi.unwrap_or(150).clamp(72, 300);

    // Pdfium is !Send+!Sync — must be created and used within a single blocking task.
    let pages = tokio::task::spawn_blocking(move || -> Result<Vec<String>, AppError> {
        let pdfium = Pdfium::default();

        let doc = pdfium
            .load_pdf_from_byte_vec(pdf_bytes, None)
            .map_err(|e| AppError::bad_request(format!("Failed to load PDF: {e}")))?;

        let mut pngs = Vec::new();

        for (i, page) in doc.pages().iter().enumerate() {
            let page_width_pts = page.width().value;
            let page_height_pts = page.height().value;

            let pixel_width = (page_width_pts * dpi as f32 / 72.0) as i32;
            let pixel_height = (page_height_pts * dpi as f32 / 72.0) as i32;

            let config = PdfRenderConfig::new()
                .set_target_width(pixel_width)
                .set_target_height(pixel_height);

            let bitmap = page
                .render_with_config(&config)
                .map_err(|e| AppError::internal(format!("Failed to render page {i}: {e}")))?;

            let img = bitmap.as_image();

            let mut png_buf = Cursor::new(Vec::new());
            img.write_to(&mut png_buf, ImageFormat::Png).map_err(|e| {
                AppError::internal(format!("Failed to encode page {i} as PNG: {e}"))
            })?;

            pngs.push(b64.encode(png_buf.into_inner()));
        }

        Ok(pngs)
    })
    .await
    .map_err(|e| AppError::internal(format!("Rasterize task panicked: {e}")))??;

    Ok(Json(RasterizeResponse { pages }))
}

struct AppError {
    status: StatusCode,
    message: String,
}

impl AppError {
    fn bad_request(msg: String) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: msg,
        }
    }

    fn internal(msg: String) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: msg,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "forme_rasterizer=info".into()),
        )
        .init();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/rasterize", post(rasterize))
        // PDFs (base64-encoded) can easily exceed axum's default 2 MB body
        // limit. Disable it — the caller is the internal API proxy, so
        // there's no DoS surface here.
        .layer(DefaultBodyLimit::disable())
        .layer(cors);

    let port: u16 = std::env::var("RASTERIZER_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("Forme rasterizer listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
