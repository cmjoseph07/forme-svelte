use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine as _;
use serde::Deserialize;
use std::collections::HashMap;

use crate::errors::ApiError;

#[derive(Deserialize)]
pub struct RedactRequest {
    /// Base64-encoded PDF bytes.
    pub pdf: String,
    /// Redaction regions to apply (coordinate-based).
    #[serde(default)]
    pub redactions: Vec<RedactionRegion>,
    /// Text search patterns to find and redact.
    #[serde(default)]
    pub patterns: Vec<RedactionPattern>,
    /// Preset names (e.g. "ssn", "email") expanded to regex patterns.
    #[serde(default)]
    pub presets: Vec<String>,
    /// Redaction template slug (hosted API only — not supported in self-hosted).
    pub template: Option<String>,
}

#[derive(Deserialize)]
pub struct RedactionRegion {
    pub page: usize,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: Option<String>,
}

#[derive(Deserialize)]
pub struct RedactionPattern {
    pub pattern: String,
    pub pattern_type: String,
    pub page: Option<usize>,
    pub color: Option<String>,
}

fn builtin_presets() -> HashMap<&'static str, forme::RedactionPattern> {
    let mut m = HashMap::new();
    m.insert(
        "ssn",
        forme::RedactionPattern {
            pattern: r"\b\d{3}-\d{2}-\d{4}\b".to_string(),
            pattern_type: forme::PatternType::Regex,
            page: None,
            color: None,
        },
    );
    m.insert(
        "email",
        forme::RedactionPattern {
            pattern: r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b".to_string(),
            pattern_type: forme::PatternType::Regex,
            page: None,
            color: None,
        },
    );
    m.insert(
        "phone",
        forme::RedactionPattern {
            pattern: r"\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b".to_string(),
            pattern_type: forme::PatternType::Regex,
            page: None,
            color: None,
        },
    );
    m.insert(
        "date-of-birth",
        forme::RedactionPattern {
            pattern: r"\b(?:0[1-9]|1[0-2])[/\-](?:0[1-9]|[12]\d|3[01])[/\-](?:19|20)\d{2}\b"
                .to_string(),
            pattern_type: forme::PatternType::Regex,
            page: None,
            color: None,
        },
    );
    m.insert(
        "credit-card",
        forme::RedactionPattern {
            pattern: r"\b(?:\d{4}[- ]?){3}\d{4}\b".to_string(),
            pattern_type: forme::PatternType::Regex,
            page: None,
            color: None,
        },
    );
    m
}

/// POST /v1/redact — redact regions of an existing PDF.
pub async fn redact(Json(payload): Json<RedactRequest>) -> Result<Response, ApiError> {
    let b64 = base64::engine::general_purpose::STANDARD;

    if payload.template.is_some() {
        return Err(ApiError::BadRequest(
            "Redaction templates require the hosted API. Pass patterns directly for self-hosted use.".to_string(),
        ));
    }

    let has_redactions = !payload.redactions.is_empty();
    let has_patterns = !payload.patterns.is_empty();
    let has_presets = !payload.presets.is_empty();

    if !has_redactions && !has_patterns && !has_presets {
        return Err(ApiError::BadRequest(
            "At least one of redactions, patterns, or presets is required".to_string(),
        ));
    }

    // Validate patterns
    if payload.patterns.len() > 50 {
        return Err(ApiError::BadRequest(
            "Maximum 50 patterns per request".to_string(),
        ));
    }
    for p in &payload.patterns {
        if p.pattern_type != "Literal" && p.pattern_type != "Regex" {
            return Err(ApiError::BadRequest(format!(
                "Invalid pattern_type: {}. Must be 'Literal' or 'Regex'",
                p.pattern_type
            )));
        }
    }

    let pdf_bytes = b64
        .decode(&payload.pdf)
        .map_err(|e| ApiError::BadRequest(format!("Invalid base64 PDF: {e}")))?;

    // Build coordinate regions
    let mut regions: Vec<forme::RedactionRegion> = payload
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

    // Build text search patterns (explicit + presets)
    let mut all_patterns: Vec<forme::RedactionPattern> = payload
        .patterns
        .into_iter()
        .map(|p| forme::RedactionPattern {
            pattern: p.pattern,
            pattern_type: if p.pattern_type == "Regex" {
                forme::PatternType::Regex
            } else {
                forme::PatternType::Literal
            },
            page: p.page,
            color: p.color,
        })
        .collect();

    if has_presets {
        let presets = builtin_presets();
        for name in &payload.presets {
            if let Some(preset) = presets.get(name.as_str()) {
                all_patterns.push(preset.clone());
            }
        }
    }

    // Find text regions and merge
    if !all_patterns.is_empty() {
        let pdf_for_search = pdf_bytes.clone();
        let text_regions = tokio::task::spawn_blocking(move || {
            forme::find_text_regions(&pdf_for_search, &all_patterns)
        })
        .await
        .map_err(|e| ApiError::Internal(format!("Search task failed: {e}")))?
        .map_err(ApiError::from)?;
        regions.extend(text_regions);
    }

    if regions.is_empty() {
        // No matches — return original PDF
        return Ok((
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/pdf")],
            pdf_bytes,
        )
            .into_response());
    }

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
