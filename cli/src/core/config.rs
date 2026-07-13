use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Redact everything after the host so embedded API keys never print — providers
/// put keys in the query (`?api-key=…`), the PATH (`/…SECRET…`), or userinfo
/// (`user:key@…`). Keeps only `scheme://host[:port]`.
/// `https://user:k@rpc.x.com/SECRET?api-key=Y` → `https://rpc.x.com/***`
pub fn redact_url(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once("://") else {
        return match url.find('?') {
            Some(i) => format!("{}?***", &url[..i]),
            None => url.to_string(),
        };
    };
    // authority = up to the first '/', '?', or '#'; everything else is the tail.
    let (authority, tail) = match rest.find(['/', '?', '#']) {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    // Strip userinfo (user:pass@) from the authority, leaving host[:port].
    let (userinfo, host) = match authority.rsplit_once('@') {
        Some((u, h)) => (Some(u), h),
        None => (None, authority),
    };
    // Any userinfo or tail can carry an embedded key → keep only scheme://host.
    if userinfo.is_some() || !tail.is_empty() {
        format!("{scheme}://{host}/***")
    } else {
        format!("{scheme}://{host}")
    }
}

/// Redact any embedded http(s) URLs inside an arbitrary message — e.g. a reqwest
/// or RPC-client error whose Display includes the endpoint (which may carry an
/// API key). Each URL is reduced to scheme://host via redact_url.
pub fn scrub_urls(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    let mut rest = msg;
    while let Some(pos) = rest.find("http") {
        let candidate = &rest[pos..];
        if candidate.starts_with("http://") || candidate.starts_with("https://") {
            out.push_str(&rest[..pos]);
            let end = candidate
                .find(|c: char| c.is_whitespace() || matches!(c, ')' | ']' | '"' | '\'' | ',' | '<' | '>'))
                .unwrap_or(candidate.len());
            out.push_str(&redact_url(&candidate[..end]));
            rest = &candidate[end..];
        } else {
            out.push_str(&rest[..pos + 4]);
            rest = &rest[pos + 4..];
        }
    }
    out.push_str(rest);
    out
}

// Only fields the V2 CLI actually reads: which key is active, and how to reach
// the base chain (cluster default or an explicit rpc_url override). Unknown keys
// in an older settings.json are ignored on load (serde drops them).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub active_key: String,
    pub cluster: String,
    pub rpc_url: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            active_key: "default".to_string(),
            cluster: "mainnet-beta".to_string(),
            rpc_url: None,
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
            "cluster" => {
                match value {
                    "mainnet-beta" | "mainnet" => settings.cluster = "mainnet-beta".to_string(),
                    "devnet" => settings.cluster = "devnet".to_string(),
                    _ => anyhow::bail!("Invalid cluster: '{value}'. Must be 'mainnet-beta' or 'devnet'"),
                }
            }
            "rpc_url" => settings.rpc_url = Some(value.to_string()),
            _ => anyhow::bail!(
                "Unknown setting: '{key}'. Valid keys: active_key, cluster, rpc_url"
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
