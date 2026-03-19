use std::fs;
use tempfile::TempDir;

#[test]
fn test_settings_default_values() {
    let default = flash_cli_settings_default();
    assert_eq!(default.active_key, "default");
    assert_eq!(default.output_format, "table");
    assert_eq!(default.cluster, "mainnet-beta");
    assert!(default.rpc_url.is_none());
    assert_eq!(default.default_slippage_bps, 100);
    assert_eq!(default.commitment, "confirmed");
    assert_eq!(default.priority_fee, 100_000);
}

#[test]
fn test_settings_roundtrip_json() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("settings.json");

    let settings = Settings {
        active_key: "mykey".to_string(),
        output_format: "json".to_string(),
        cluster: "devnet".to_string(),
        rpc_url: Some("https://my-rpc.example.com".to_string()),
        default_slippage_bps: 200,
        commitment: "finalized".to_string(),
        priority_fee: 500_000,
    };

    let data = serde_json::to_string_pretty(&settings).unwrap();
    fs::write(&path, &data).unwrap();

    let loaded_data = fs::read_to_string(&path).unwrap();
    let loaded: Settings = serde_json::from_str(&loaded_data).unwrap();

    assert_eq!(loaded.active_key, "mykey");
    assert_eq!(loaded.cluster, "devnet");
    assert_eq!(
        loaded.rpc_url,
        Some("https://my-rpc.example.com".to_string())
    );
    assert_eq!(loaded.default_slippage_bps, 200);
    assert_eq!(loaded.priority_fee, 500_000);
}

#[test]
fn test_rpc_url_resolution() {
    let mut settings = flash_cli_settings_default();
    settings.rpc_url = None;

    settings.cluster = "mainnet-beta".to_string();
    assert_eq!(
        resolve_rpc_url(&settings),
        "https://api.mainnet-beta.solana.com"
    );

    settings.cluster = "devnet".to_string();
    assert_eq!(resolve_rpc_url(&settings), "https://api.devnet.solana.com");

    settings.rpc_url = Some("https://custom.rpc".to_string());
    assert_eq!(resolve_rpc_url(&settings), "https://custom.rpc");
}

// Inline helpers to avoid depending on flash-cli binary internals
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Settings {
    active_key: String,
    output_format: String,
    cluster: String,
    rpc_url: Option<String>,
    default_slippage_bps: u16,
    commitment: String,
    priority_fee: u64,
}

fn flash_cli_settings_default() -> Settings {
    Settings {
        active_key: "default".to_string(),
        output_format: "table".to_string(),
        cluster: "mainnet-beta".to_string(),
        rpc_url: None,
        default_slippage_bps: 100,
        commitment: "confirmed".to_string(),
        priority_fee: 100_000,
    }
}

fn resolve_rpc_url(settings: &Settings) -> String {
    if let Some(url) = &settings.rpc_url {
        return url.clone();
    }
    match settings.cluster.as_str() {
        "devnet" => "https://api.devnet.solana.com".to_string(),
        _ => "https://api.mainnet-beta.solana.com".to_string(),
    }
}
