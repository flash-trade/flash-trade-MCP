use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub active_key: String,
    pub output_format: String,
    pub cluster: String,
    pub rpc_url: Option<String>,
    pub default_slippage_bps: u16,
    pub commitment: String,
    pub priority_fee: u64,
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
        }
    }
}

pub struct Config;

impl Config {
    pub fn config_dir() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("~/.config"))
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

        if !Self::settings_path().exists() {
            Self::save(&Settings::default())?;
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
            _ => anyhow::bail!(
                "Unknown setting: '{key}'. Valid keys: active_key, output_format, cluster, rpc_url, default_slippage_bps, commitment, priority_fee"
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
