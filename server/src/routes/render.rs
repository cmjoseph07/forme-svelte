use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use crate::config::Config;
use crate::errors::ApiError;

#[derive(Deserialize)]
pub struct InlineRenderRequest {
    /// Compiled document JSON tree (sent as a JSON object, not a string).
    pub template: Value,
    /// Optional template data for expression evaluation.
    pub data: Option<Value>,
}

#[derive(Deserialize)]
pub struct SlugRenderRequest {
    /// Optional template data for expression evaluation.
    pub data: Option<Value>,
}

/// POST /v1/render — inline render with template + data in the request body.
pub async fn render_inline(Json(payload): Json<InlineRenderRequest>) -> Result<Response, ApiError> {
    let template_str = serde_json::to_string(&payload.template)
        .map_err(|e| ApiError::BadRequest(format!("Invalid template JSON: {e}")))?;

    let pdf_bytes = if let Some(data) = payload.data {
        let data_str = serde_json::to_string(&data)
            .map_err(|e| ApiError::BadRequest(format!("Invalid data JSON: {e}")))?;
        tokio::task::spawn_blocking(move || forme::render_template(&template_str, &data_str))
            .await
            .map_err(|e| ApiError::Internal(format!("Render task failed: {e}")))?
    } else {
        tokio::task::spawn_blocking(move || forme::render_json(&template_str))
            .await
            .map_err(|e| ApiError::Internal(format!("Render task failed: {e}")))?
    }?;

    Ok(pdf_response(pdf_bytes))
}

/// POST /v1/render/:slug — render a pre-compiled template from the templates directory.
pub async fn render_slug(
    State(config): State<Arc<Config>>,
    Path(slug): Path<String>,
    Json(payload): Json<SlugRenderRequest>,
) -> Result<Response, ApiError> {
    let templates_dir = config.templates_dir.as_ref().ok_or_else(|| {
        ApiError::NotFound(
            "Template directory not configured. Set FORME_TEMPLATES_DIR environment variable."
                .to_string(),
        )
    })?;

    // Path traversal prevention — this is a security boundary
    if slug.is_empty()
        || slug.contains("..")
        || slug.contains('/')
        || slug.contains('\\')
        || slug.contains('\0')
    {
        return Err(ApiError::BadRequest("Invalid template slug".to_string()));
    }

    let template_path = templates_dir.join(format!("{slug}.json"));

    let template_str = tokio::fs::read_to_string(&template_path)
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ApiError::NotFound(format!(
                    "Template '{slug}' not found. Templates must be pre-compiled JSON \
                 — run 'forme build --template' to compile .tsx templates."
                ))
            } else {
                ApiError::Internal(format!("Failed to read template: {e}"))
            }
        })?;

    let pdf_bytes = if let Some(data) = payload.data {
        let data_str = serde_json::to_string(&data)
            .map_err(|e| ApiError::BadRequest(format!("Invalid data JSON: {e}")))?;
        tokio::task::spawn_blocking(move || forme::render_template(&template_str, &data_str))
            .await
            .map_err(|e| ApiError::Internal(format!("Render task failed: {e}")))?
    } else {
        tokio::task::spawn_blocking(move || forme::render_json(&template_str))
            .await
            .map_err(|e| ApiError::Internal(format!("Render task failed: {e}")))?
    }?;

    Ok(pdf_response(pdf_bytes))
}

fn pdf_response(pdf_bytes: Vec<u8>) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/pdf")],
        pdf_bytes,
    )
        .into_response()
}
