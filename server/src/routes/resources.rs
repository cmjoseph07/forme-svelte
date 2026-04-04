use crate::errors::ApiError;

pub async fn list_templates() -> Result<(), ApiError> {
    Err(ApiError::NotImplemented(
        "Template listing requires the hosted API".to_string(),
    ))
}

pub async fn list_documents() -> Result<(), ApiError> {
    Err(ApiError::NotImplemented(
        "Document listing requires the hosted API".to_string(),
    ))
}

pub async fn list_redaction_templates() -> Result<(), ApiError> {
    Err(ApiError::NotImplemented(
        "Redaction template listing requires the hosted API".to_string(),
    ))
}

pub async fn list_certificates() -> Result<(), ApiError> {
    Err(ApiError::NotImplemented(
        "Certificate listing requires the hosted API".to_string(),
    ))
}
