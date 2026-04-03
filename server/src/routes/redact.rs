use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine as _;
use serde::Deserialize;

use crate::errors::ApiError;

#[derive(Deserialize)]
pub struct RedactRequest {
    /// Base64-encoded PDF bytes.
    pub pdf: String,
    /// Redaction regions to apply.
    pub redactions: Vec<RedactionRegion>,
}

#[derive(Deserialize)]
pub struct RedactionRegion {
    /// 0-indexed page number.
    pub page: usize,
    /// X coordinate in points from the left edge.
    pub x: f64,
    /// Y coordinate in points from the top edge (web coordinates).
    pub y: f64,
    /// Width of the redaction rectangle in points.
    pub width: f64,
    /// Height of the redaction rectangle in points.
    pub height: f64,
    /// Fill color as hex string (e.g. "#000000"). Defaults to black.
    pub color: Option<String>,
}

/// POST /v1/redact — redact regions of an existing PDF.
pub async fn redact(Json(payload): Json<RedactRequest>) -> Result<Response, ApiError> {
    let b64 = base64::engine::general_purpose::STANDARD;

    let pdf_bytes = b64
        .decode(&payload.pdf)
        .map_err(|e| ApiError::BadRequest(format!("Invalid base64 PDF: {e}")))?;

    let regions: Vec<forme::RedactionRegion> = payload
        .redactions
        .into_iter()
        .map(|r| forme::RedactionRegion {
            page: r.page,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            color: r.color,
        })
        .collect();

    let redacted_bytes =
        tokio::task::spawn_blocking(move || forme::redact_pdf(&pdf_bytes, &regions))
            .await
            .map_err(|e| ApiError::Internal(format!("Redact task failed: {e}")))?
            .map_err(ApiError::from)?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/pdf")],
        redacted_bytes,
    )
        .into_response())
}
