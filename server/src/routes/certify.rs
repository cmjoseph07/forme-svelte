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
pub struct CertifyRequest {
    /// Base64-encoded PDF bytes.
    pub pdf: String,
    /// PEM-encoded X.509 certificate.
    #[serde(alias = "certificatePem")]
    pub certificate: String,
    /// PEM-encoded RSA private key (PKCS#8 or PKCS#1).
    #[serde(alias = "privateKeyPem")]
    pub private_key: String,
    /// Stored certificate ID (hosted-only, rejected here).
    pub certificate_id: Option<String>,
    /// Reason for certification.
    pub reason: Option<String>,
    /// Location of certification.
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

/// POST /v1/certify — certify an existing PDF with an X.509 certificate.
pub async fn certify(Json(payload): Json<CertifyRequest>) -> Result<Response, ApiError> {
    if payload.certificate_id.is_some() {
        return Err(ApiError::BadRequest(
            "certificateId is not supported in self-hosted mode. \
             Pass certificate and privateKey directly."
                .into(),
        ));
    }

    let b64 = base64::engine::general_purpose::STANDARD;

    let pdf_bytes = b64
        .decode(&payload.pdf)
        .map_err(|e| ApiError::BadRequest(format!("Invalid base64 PDF: {e}")))?;

    let config = forme::CertificationConfig {
        certificate_pem: payload.certificate,
        private_key_pem: payload.private_key,
        reason: payload.reason,
        location: payload.location,
        contact: payload.contact,
        visible: payload.visible,
        x: payload.x,
        y: payload.y,
        width: payload.width,
        height: payload.height,
    };

    let certified_bytes =
        tokio::task::spawn_blocking(move || forme::certify_pdf(&pdf_bytes, &config))
            .await
            .map_err(|e| ApiError::Internal(format!("Certify task failed: {e}")))?
            .map_err(ApiError::from)?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/pdf")],
        certified_bytes,
    )
        .into_response())
}
