use axum::Json;
use serde::{Deserialize, Serialize};

use crate::errors::ApiError;

#[derive(Deserialize, Serialize)]
pub struct RasterizeRequest {
    /// Base64-encoded PDF bytes.
    pub pdf: String,
    /// DPI for rasterization. Default 150, clamped to 72..=300.
    pub dpi: Option<u32>,
}

#[derive(Deserialize, Serialize)]
pub struct RasterizeResponse {
    /// Base64-encoded PNG images, one per page.
    pub pages: Vec<String>,
}

/// POST /v1/rasterize — proxy to rasterizer sidecar.
pub async fn rasterize(
    Json(payload): Json<RasterizeRequest>,
) -> Result<Json<RasterizeResponse>, ApiError> {
    let rasterizer_url =
        std::env::var("RASTERIZER_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{rasterizer_url}/rasterize"))
        .json(&payload)
        .send()
        .await
        .map_err(|e| ApiError::Internal(format!("Rasterizer unavailable: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(if status == 400 {
            ApiError::BadRequest(format!("Rasterizer error: {body}"))
        } else {
            ApiError::Internal(format!("Rasterizer error ({status}): {body}"))
        });
    }

    let result: RasterizeResponse = resp
        .json()
        .await
        .map_err(|e| ApiError::Internal(format!("Invalid rasterizer response: {e}")))?;

    Ok(Json(result))
}
