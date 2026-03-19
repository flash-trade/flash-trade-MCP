use anyhow::{Context, Result};
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use std::fs;
use std::path::{Path, PathBuf};

use crate::core::config::{Config, Settings};

pub struct WalletManager;

impl WalletManager {
    fn key_path(name: &str) -> PathBuf {
        Config::keys_dir().join(format!("{name}.json"))
    }

    pub fn load(name: &str) -> Result<Keypair> {
        let path = Self::key_path(name);
        if !path.exists() {
            anyhow::bail!(
                "Keypair '{name}' not found in keystore. Run `flash keys list` to see available keys \
                 or `flash keys generate {name}` to create one."
            );
        }
        let data = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read keypair: {}", path.display()))?;
        let bytes: Vec<u8> = serde_json::from_str(&data)
            .with_context(|| format!("Invalid keypair format in {}", path.display()))?;
        Keypair::try_from(bytes.as_slice())
            .map_err(|e| anyhow::anyhow!("Invalid keypair bytes in {}: {e}", path.display()))
    }

    pub fn save(name: &str, keypair: &Keypair) -> Result<()> {
        Config::init()?;
        let path = Self::key_path(name);
        let bytes = keypair.to_bytes();
        let data = serde_json::to_string(&bytes.to_vec())?;
        fs::write(&path, &data)
            .with_context(|| format!("Failed to write keypair: {}", path.display()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
        }

        Ok(())
    }

    pub fn list() -> Result<Vec<String>> {
        let dir = Config::keys_dir();
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut names = Vec::new();
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    names.push(stem.to_string());
                }
            }
        }
        names.sort();
        Ok(names)
    }

    pub fn delete(name: &str) -> Result<()> {
        let path = Self::key_path(name);
        if !path.exists() {
            anyhow::bail!("Keypair '{name}' not found in keystore");
        }
        fs::remove_file(&path)
            .with_context(|| format!("Failed to delete keypair: {}", path.display()))?;
        Ok(())
    }

    pub fn exists(name: &str) -> bool {
        Self::key_path(name).exists()
    }

    pub fn import_file(name: &str, path: &Path) -> Result<()> {
        if !path.exists() {
            anyhow::bail!("File not found: {}", path.display());
        }
        let data = fs::read_to_string(path)
            .with_context(|| format!("Failed to read file: {}", path.display()))?;
        let bytes: Vec<u8> = serde_json::from_str(&data)
            .with_context(|| format!("Invalid keypair JSON format in {}", path.display()))?;
        let keypair = Keypair::try_from(bytes.as_slice())
            .map_err(|e| anyhow::anyhow!("Invalid keypair bytes: {e}"))?;
        Self::save(name, &keypair)?;
        Ok(())
    }

    pub fn import_solana_default(name: &str) -> Result<()> {
        let solana_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("~/.config"))
            .join("solana")
            .join("id.json");
        Self::import_file(name, &solana_path)
            .with_context(|| "Failed to import from Solana CLI default keypair")
    }

    pub fn import_private_key(name: &str, key: &str) -> Result<()> {
        let bytes = bs58::decode(key)
            .into_vec()
            .with_context(|| "Invalid base58 private key")?;
        let keypair = Keypair::try_from(bytes.as_slice())
            .map_err(|e| anyhow::anyhow!("Invalid private key bytes: {e}"))?;
        Self::save(name, &keypair)?;
        Ok(())
    }

    pub fn generate(name: &str) -> Result<solana_sdk::pubkey::Pubkey> {
        let keypair = Keypair::new();
        let pubkey = keypair.pubkey();
        Self::save(name, &keypair)?;
        Ok(pubkey)
    }

    pub fn resolve(key_override: Option<&str>, settings: &Settings) -> Result<Keypair> {
        let name = key_override.unwrap_or(settings.active_key.as_str());
        Self::load(name)
    }

    pub fn pubkey_for(name: &str) -> Result<solana_sdk::pubkey::Pubkey> {
        let keypair = Self::load(name)?;
        Ok(keypair.pubkey())
    }
}
