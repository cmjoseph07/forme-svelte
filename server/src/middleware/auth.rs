use std::sync::Arc;

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};

use crate::config::Config;
use crate::errors::ApiError;

/// Optional bearer token auth middleware.
///
/// If `FORME_API_KEY` is configured, all requests must include
/// `Authorization: Bearer <key>`. If not configured, all requests pass through.
pub async fn optional_auth(
    State(config): State<Arc<Config>>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let Some(ref expected_key) = config.api_key else {
        return Ok(next.run(request).await);
    };

    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let Some(header_value) = auth_header else {
        return Err(ApiError::Unauthorized);
    };

    let token = header_value.strip_prefix("Bearer ").unwrap_or(header_value);

    // Constant-time comparison to prevent timing attacks
    if !constant_time_eq(token.as_bytes(), expected_key.as_bytes()) {
        return Err(ApiError::Unauthorized);
    }

    Ok(next.run(request).await)
}

/// Constant-time byte comparison.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_eq_works() {
        assert!(constant_time_eq(b"hello", b"hello"));
        assert!(!constant_time_eq(b"hello", b"world"));
        assert!(!constant_time_eq(b"hello", b"hell"));
        assert!(!constant_time_eq(b"", b"x"));
        assert!(constant_time_eq(b"", b""));
    }
}
