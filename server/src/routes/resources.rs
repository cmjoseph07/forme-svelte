use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

pub async fn list_templates() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({ "error": "Template listing requires the hosted API" })),
    )
}

pub async fn list_documents() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({ "error": "Document listing requires the hosted API" })),
    )
}

pub async fn list_redaction_templates() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({ "error": "Redaction template listing requires the hosted API" })),
    )
}

pub async fn list_certificates() -> impl IntoResponse {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({ "error": "Certificate listing requires the hosted API" })),
    )
}
