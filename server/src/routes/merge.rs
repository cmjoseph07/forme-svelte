use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine as _;
use serde::Deserialize;

use crate::errors::ApiError;

#[derive(Deserialize)]
pub struct MergeRequest {
    /// Base64-encoded PDF bytes to merge (in order).
    pub pdfs: Vec<String>,
}

/// POST /v1/merge — merge multiple PDFs into a single PDF.
pub async fn merge(Json(payload): Json<MergeRequest>) -> Result<Response, ApiError> {
    if payload.pdfs.len() < 2 {
        return Err(ApiError::BadRequest(
            "pdfs array must contain at least 2 PDFs".to_string(),
        ));
    }
    if payload.pdfs.len() > 20 {
        return Err(ApiError::BadRequest(
            "pdfs array must contain at most 20 PDFs".to_string(),
        ));
    }

    let b64 = base64::engine::general_purpose::STANDARD;

    let decoded: Vec<Vec<u8>> = payload
        .pdfs
        .iter()
        .enumerate()
        .map(|(i, pdf)| {
            b64.decode(pdf)
                .map_err(|e| ApiError::BadRequest(format!("Invalid base64 PDF at index {i}: {e}")))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let merged_bytes = tokio::task::spawn_blocking(move || {
        let refs: Vec<&[u8]> = decoded.iter().map(|v| v.as_slice()).collect();
        forme::merge_pdfs(&refs)
    })
    .await
    .map_err(|e| ApiError::Internal(format!("Merge task failed: {e}")))?
    .map_err(ApiError::from)?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/pdf")],
        merged_bytes,
    )
        .into_response())
}
