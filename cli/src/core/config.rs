use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Redact query parameters from URLs to avoid leaking API keys in output.
/// `https://rpc.example.com/?api-key=SECRET` → `https://rpc.example.com/?***`
pub fn redact_url(url: &str) -> String {
    if let Some(idx) = url.find('?') {
        format!("{}?***", &url[..idx])
    } else {
        url.to_string()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub active_key: String,
    pub output_format: String,
    pub cluster: String,
    pub rpc_url: Option<String>,
    pub default_slippage_bps: u16,
    pub commitment: String,
    pub priority_fee: u64,
    /// When true, failed RPC calls rotate through fallback endpoints before giving up.
    #[serde(default = "default_true")]
    pub rpc_failover: bool,
    /// Additional RPC URLs to try when the primary fails (tried in order).
    #[serde(default)]
    pub rpc_fallbacks: Vec<String>,
    /// URL to fetch fresh pool configs from (falls back to bundled JSON on failure).
    #[serde(default)]
    pub pool_config_url: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            active_key: "default".to_string(),
            output_format: "table".to_string(),
            cluster: "mainnet-beta".to_string(),
            rpc_url: None,
            default_slippage_bps: 100,
            commitment: "confirmed".to_string(),
            priority_fee: 100_000,
            rpc_failover: true,
            rpc_fallbacks: Vec::new(),
            pool_config_url: None,
        }
    }
}

pub struct Config;

impl Config {
    pub fn config_dir() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| {
                // Returning a literal "~/.config" would fail to exist(); expand $HOME.
                std::env::var("HOME")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join(".config")
            })
            .join("flash")
    }

    pub fn settings_path() -> PathBuf {
        Self::config_dir().join("settings.json")
    }

    pub fn keys_dir() -> PathBuf {
        Self::config_dir().join("keys")
    }

    pub fn init() -> Result<()> {
        let config_dir = Self::config_dir();
        fs::create_dir_all(&config_dir).with_context(|| {
            format!(
                "Failed to create config directory: {}",
                config_dir.display()
            )
        })?;

        let keys_dir = Self::keys_dir();
        fs::create_dir_all(&keys_dir)
            .with_context(|| format!("Failed to create keys directory: {}", keys_dir.display()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&keys_dir, fs::Permissions::from_mode(0o700))?;
        }

        let settings_path = Self::settings_path();
        if !settings_path.exists() {
            Self::save(&Settings::default())?;
        } else {
            // Tighten permissions on pre-existing settings.json that may have been
            // created by an older version before the 0o600 logic was added.
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&settings_path, fs::Permissions::from_mode(0o600));
            }
        }

        Ok(())
    }

    pub fn load() -> Result<Settings> {
        let path = Self::settings_path();
        if !path.exists() {
            Self::init()?;
            return Ok(Settings::default());
        }
        let data = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read settings: {}", path.display()))?;
        let settings: Settings =
            serde_json::from_str(&data).with_context(|| "Failed to parse settings.json")?;
        Ok(settings)
    }

    pub fn save(settings: &Settings) -> Result<()> {
        let path = Self::settings_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(settings)?;
        fs::write(&path, data)
            .with_context(|| format!("Failed to write settings: {}", path.display()))?;

        // settings.json can contain an RPC URL with an embedded API key, so tighten
        // permissions to owner-only read/write (matches the 0o600 we set on keypair files).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                .with_context(|| format!("Failed to set permissions on settings: {}", path.display()))?;
        }

        Ok(())
    }

    pub fn set(key: &str, value: &str) -> Result<()> {
        let mut settings = Self::load()?;
        match key {
            "active_key" => settings.active_key = value.to_string(),
            "output_format" => {
                match value {
                    "table" | "json" => settings.output_format = value.to_string(),
                    _ => anyhow::bail!("Invalid output_format: '{value}'. Must be 'table' or 'json'"),
                }
            }
            "cluster" => {
                match value {
                    "mainnet-beta" | "mainnet" => settings.cluster = "mainnet-beta".to_string(),
                    "devnet" => settings.cluster = "devnet".to_string(),
                    _ => anyhow::bail!("Invalid cluster: '{value}'. Must be 'mainnet-beta' or 'devnet'"),
                }
            }
            "rpc_url" => settings.rpc_url = Some(value.to_string()),
            "default_slippage_bps" => {
                settings.default_slippage_bps = value.parse()
                    .with_context(|| format!("Invalid slippage: '{value}'. Must be a number (basis points)"))?;
            }
            "commitment" => {
                match value {
                    "processed" | "confirmed" | "finalized" => settings.commitment = value.to_string(),
                    _ => anyhow::bail!("Invalid commitment: '{value}'. Must be processed/confirmed/finalized"),
                }
            }
            "priority_fee" => {
                settings.priority_fee = value.parse()
                    .with_context(|| format!("Invalid priority_fee: '{value}'. Must be a number (microlamports)"))?;
            }
            "rpc_failover" => {
                settings.rpc_failover = match value {
                    "on" | "true" | "yes" | "1" => true,
                    "off" | "false" | "no" | "0" => false,
                    _ => anyhow::bail!("Invalid rpc_failover: '{value}'. Must be on/off, true/false, yes/no"),
                };
            }
            "rpc_fallbacks" => {
                settings.rpc_fallbacks = if value.is_empty() {
                    Vec::new()
                } else {
                    value.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
                };
            }
            "pool_config_url" => {
                settings.pool_config_url = if value.is_empty() || value == "none" {
                    None
                } else if !value.starts_with("https://") {
                    anyhow::bail!(
                        "pool_config_url must use HTTPS to prevent man-in-the-middle attacks \
                         on pool config data. Got: '{}'",
                        redact_url(value)
                    )
                } else {
                    Some(value.to_string())
                };
            }
            _ => anyhow::bail!(
                "Unknown setting: '{key}'. Valid keys: active_key, output_format, cluster, rpc_url, \
                 default_slippage_bps, commitment, priority_fee, rpc_failover, rpc_fallbacks, pool_config_url"
            ),
        }
        Self::save(&settings)?;
        Ok(())
    }

    pub fn reset() -> Result<()> {
        Self::save(&Settings::default())?;
        Ok(())
    }

    pub fn rpc_url(settings: &Settings) -> String {
        if let Some(url) = &settings.rpc_url {
            return url.clone();
        }
        match settings.cluster.as_str() {
            "devnet" => "https://api.devnet.solana.com".to_string(),
            _ => "https://api.mainnet-beta.solana.com".to_string(),
        }
    }
}
