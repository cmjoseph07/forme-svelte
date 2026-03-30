pub mod health;
pub mod render;
pub mod sign;

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
        .route("/v1/sign", post(sign::sign))
        .layer(middleware::from_fn_with_state(
            config.clone(),
            optional_auth,
        ))
        .with_state(config.clone());

    Router::new().merge(public).merge(api)
}
