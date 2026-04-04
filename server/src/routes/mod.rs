pub mod certify;
pub mod health;
pub mod merge;
pub mod rasterize;
pub mod redact;
pub mod render;
pub mod resources;

use std::sync::Arc;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};

use crate::config::Config;
use crate::middleware::auth::optional_auth;

pub fn router(config: Arc<Config>) -> Router {
    let public = Router::new().route("/health", get(health::health));

    let api = Router::new()
        .route("/v1/render", post(render::render_inline))
        .route("/v1/render/{slug}", post(render::render_slug))
        .route("/v1/certify", post(certify::certify))
        .route("/v1/rasterize", post(rasterize::rasterize))
        .route("/v1/merge", post(merge::merge))
        .route("/v1/redact", post(redact::redact))
        .route("/v1/templates", get(resources::list_templates))
        .route("/v1/documents", get(resources::list_documents))
        .route(
            "/v1/redaction-templates",
            get(resources::list_redaction_templates),
        )
        .route("/v1/certificates", get(resources::list_certificates))
        .layer(middleware::from_fn_with_state(
            config.clone(),
            optional_auth,
        ))
        .with_state(config.clone());

    Router::new().merge(public).merge(api)
}
