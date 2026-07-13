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
}

#[test]
fn settings_roundtrip_through_json() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("settings.json");
    let s = Settings {
        active_key: "mykey".to_string(),
        cluster: "devnet".to_string(),
        rpc_url: Some("https://my-rpc.example.com".to_string()),
    };

    fs::write(&path, serde_json::to_string_pretty(&s).unwrap()).unwrap();
    let loaded: Settings = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();

    assert_eq!(loaded.active_key, "mykey");
    assert_eq!(loaded.cluster, "devnet");
    assert_eq!(loaded.rpc_url.as_deref(), Some("https://my-rpc.example.com"));
}

#[test]
fn deserializes_settings_with_dropped_legacy_fields() {
    // An older settings.json carries fields this V2 build no longer models
    // (output_format, default_slippage_bps, commitment, priority_fee,
    // rpc_failover, rpc_fallbacks, the V1 pool_config_url). Serde must ignore the
    // unknown keys and still populate the three fields we kept — never error.
    let old = r#"{
        "active_key": "main",
        "output_format": "table",
        "cluster": "devnet",
        "rpc_url": null,
        "default_slippage_bps": 100,
        "commitment": "confirmed",
        "priority_fee": 100000,
        "rpc_failover": true,
        "rpc_fallbacks": [],
        "pool_config_url": "https://legacy.example.com/pool-config"
    }"#;
    let s: Settings = serde_json::from_str(old).expect("must deserialize legacy settings");
    assert_eq!(s.active_key, "main");
    assert_eq!(s.cluster, "devnet");
    assert!(s.rpc_url.is_none());
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
fn redact_url_strips_query_path_and_userinfo_secrets() {
    // Query-embedded key.
    assert_eq!(redact_url("https://rpc.example.com/?api-key=SECRET"), "https://rpc.example.com/***");
    // Path-embedded key (Helius/Triton style).
    assert_eq!(redact_url("https://rpc.example.com/SECRETKEY"), "https://rpc.example.com/***");
    // Userinfo-embedded key.
    assert_eq!(redact_url("https://user:SECRET@rpc.example.com"), "https://rpc.example.com/***");
    // Bare host with no tail is printed in full (nothing to hide).
    assert_eq!(redact_url("https://api.mainnet-beta.solana.com"), "https://api.mainnet-beta.solana.com");
}
