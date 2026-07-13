// Settings serde + URL redaction, against the REAL Config/Settings types.

use flash_cli::core::config::{redact_url, Config, Settings};
use std::fs;
use tempfile::TempDir;

#[test]
fn default_settings_values() {
    let d = Settings::default();
    assert_eq!(d.active_key, "default");
    assert_eq!(d.cluster, "mainnet-beta");
    assert!(d.rpc_url.is_none());
    assert_eq!(d.default_slippage_bps, 100);
    assert_eq!(d.commitment, "confirmed");
    assert!(d.rpc_failover);
    assert!(d.rpc_fallbacks.is_empty());
}

#[test]
fn settings_roundtrip_through_json() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("settings.json");
    let s = Settings {
        active_key: "mykey".to_string(),
        cluster: "devnet".to_string(),
        rpc_url: Some("https://my-rpc.example.com".to_string()),
        ..Default::default()
    };

    fs::write(&path, serde_json::to_string_pretty(&s).unwrap()).unwrap();
    let loaded: Settings = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();

    assert_eq!(loaded.active_key, "mykey");
    assert_eq!(loaded.cluster, "devnet");
    assert_eq!(loaded.rpc_url.as_deref(), Some("https://my-rpc.example.com"));
}

#[test]
fn deserializes_settings_written_before_failover_fields_existed() {
    // Older settings.json lacks rpc_failover/rpc_fallbacks — serde defaults must
    // fill them rather than erroring. A dropped V1 field (pool_config_url) present
    // in an old file is ignored, not rejected.
    let old = r#"{
        "active_key": "main",
        "output_format": "table",
        "cluster": "mainnet-beta",
        "rpc_url": null,
        "default_slippage_bps": 100,
        "commitment": "confirmed",
        "priority_fee": 100000,
        "pool_config_url": "https://legacy.example.com/pool-config"
    }"#;
    let s: Settings = serde_json::from_str(old).expect("must deserialize legacy settings");
    assert!(s.rpc_failover);
    assert!(s.rpc_fallbacks.is_empty());
}

#[test]
fn config_rpc_url_resolves_by_cluster_then_override() {
    let mut s = Settings {
        rpc_url: None,
        cluster: "mainnet-beta".to_string(),
        ..Default::default()
    };
    assert_eq!(Config::rpc_url(&s), "https://api.mainnet-beta.solana.com");

    s.cluster = "devnet".to_string();
    assert_eq!(Config::rpc_url(&s), "https://api.devnet.solana.com");

    s.rpc_url = Some("https://custom.rpc".to_string());
    assert_eq!(Config::rpc_url(&s), "https://custom.rpc");
}

#[test]
fn redact_url_strips_query_secrets() {
    assert_eq!(redact_url("https://rpc.example.com/?api-key=SECRET"), "https://rpc.example.com/?***");
    assert_eq!(redact_url("https://rpc.example.com/path"), "https://rpc.example.com/path");
}
