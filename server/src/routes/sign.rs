use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine as _;
use serde::Deserialize;

use crate::errors::ApiError;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignRequest {
    /// Base64-encoded PDF bytes.
    pub pdf: String,
    /// PEM-encoded X.509 certificate.
    pub certificate_pem: String,
    /// PEM-encoded RSA private key (PKCS#8).
    pub private_key_pem: String,
    /// Reason for signing.
    pub reason: Option<String>,
    /// Location of signing.
    pub location: Option<String>,
    /// Contact info.
    pub contact: Option<String>,
    /// Show a visible signature annotation.
    #[serde(default)]
    pub visible: bool,
    /// X coordinate in points for visible signature.
    pub x: Option<f64>,
    /// Y coordinate in points for visible signature.
    pub y: Option<f64>,
    /// Width in points for visible signature.
    pub width: Option<f64>,
    /// Height in points for visible signature.
    pub height: Option<f64>,
}

/// POST /v1/sign — sign an existing PDF with an X.509 certificate.
pub async fn sign(Json(payload): Json<SignRequest>) -> Result<Response, ApiError> {
    let b64 = base64::engine::general_purpose::STANDARD;

    let pdf_bytes = b64
        .decode(&payload.pdf)
        .map_err(|e| ApiError::BadRequest(format!("Invalid base64 PDF: {e}")))?;

    let config = forme::SignatureConfig {
        certificate_pem: payload.certificate_pem,
        private_key_pem: payload.private_key_pem,
        reason: payload.reason,
        location: payload.location,
        contact: payload.contact,
        visible: payload.visible,
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
    };

    let signed_bytes = tokio::task::spawn_blocking(move || forme::sign_pdf(&pdf_bytes, &config))
        .await
        .map_err(|e| ApiError::Internal(format!("Sign task failed: {e}")))?
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/pdf")],
        signed_bytes,
    )
        .into_response())
}
