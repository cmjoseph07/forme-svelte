use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("{0}")]
    NotFound(String),

    #[error("Render failed: {0}")]
    RenderFailed(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::RenderFailed(_) => StatusCode::BAD_REQUEST,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            ApiError::BadRequest(_) => "BAD_REQUEST",
            ApiError::Unauthorized => "UNAUTHORIZED",
            ApiError::NotFound(_) => "NOT_FOUND",
            ApiError::RenderFailed(_) => "RENDER_FAILED",
            ApiError::Internal(_) => "INTERNAL_ERROR",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = json!({
            "error": self.to_string(),
            "code": self.code(),
        });
        (self.status_code(), axum::Json(body)).into_response()
    }
}

impl From<forme::FormeError> for ApiError {
    fn from(err: forme::FormeError) -> Self {
        ApiError::RenderFailed(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_codes() {
        assert_eq!(
            ApiError::BadRequest("x".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ApiError::Unauthorized.status_code(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            ApiError::NotFound("x".into()).status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            ApiError::RenderFailed("x".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ApiError::Internal("x".into()).status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn error_codes() {
        assert_eq!(ApiError::BadRequest("".into()).code(), "BAD_REQUEST");
        assert_eq!(ApiError::Unauthorized.code(), "UNAUTHORIZED");
        assert_eq!(ApiError::NotFound("".into()).code(), "NOT_FOUND");
        assert_eq!(ApiError::RenderFailed("".into()).code(), "RENDER_FAILED");
        assert_eq!(ApiError::Internal("".into()).code(), "INTERNAL_ERROR");
    }
}
