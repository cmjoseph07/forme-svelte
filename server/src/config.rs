use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub http_port: u16,
    pub api_key: Option<String>,
    pub templates_dir: Option<PathBuf>,
}

impl Config {
    pub fn from_env() -> Self {
        let http_port = env::var("HTTP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3000);

        let api_key = env::var("FORME_API_KEY").ok().filter(|k| !k.is_empty());

        let templates_dir = env::var("FORME_TEMPLATES_DIR").ok().map(PathBuf::from);

        Self {
            http_port,
            api_key,
            templates_dir,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_port_is_3000() {
        // Clear env to test default
        env::remove_var("HTTP_PORT");
        env::remove_var("FORME_API_KEY");
        env::remove_var("FORME_TEMPLATES_DIR");
        let config = Config::from_env();
        assert_eq!(config.http_port, 3000);
        assert!(config.api_key.is_none());
        assert!(config.templates_dir.is_none());
    }

    #[test]
    fn empty_api_key_is_none() {
        env::set_var("FORME_API_KEY", "");
        let config = Config::from_env();
        assert!(config.api_key.is_none());
        env::remove_var("FORME_API_KEY");
    }
}
