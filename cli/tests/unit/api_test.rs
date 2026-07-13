// API DTO + response-shape guards. The live backend field is `mint` (not the
// spec's `mintKey`) and transaction builders return `transactionBase64` — both
// are load-bearing for setup/withdrawal and signing, so pin them here.

use flash_cli::core::api::{extract_tx, TokenInfo};
use serde_json::json;

#[test]
fn token_info_reads_the_live_mint_field() {
    let v = json!({
        "symbol": "USDC",
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "decimals": 6,
        "isStable": true,
        "isToken2022": false
    });
    let t: TokenInfo = serde_json::from_value(v).expect("must parse live token shape");
    assert_eq!(t.symbol, "USDC");
    assert_eq!(t.mint, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    assert_eq!(t.decimals, 6);
    assert!(t.is_stable);
    assert!(!t.is_token2022);
    assert!(!t.is_virtual); // defaulted when absent
}

#[test]
fn token_info_flags_token2022_when_set() {
    let v = json!({ "symbol": "PYUSD", "mint": "2b1k...", "decimals": 6, "isToken2022": true });
    let t: TokenInfo = serde_json::from_value(v).unwrap();
    assert!(t.is_token2022, "Token-2022 assets must be flagged for correct deposits");
}

#[test]
fn extract_tx_returns_the_builder_transaction() {
    let resp = json!({ "transactionBase64": "AQID", "err": null });
    assert_eq!(extract_tx(&resp).as_deref(), Some("AQID"));
}

#[test]
fn extract_tx_is_none_for_quote_only_and_empty() {
    // Quote-only open-position (no owner): no transaction field.
    assert!(extract_tx(&json!({ "newLeverage": "5.0" })).is_none());
    // Present but empty string is treated as absent.
    assert!(extract_tx(&json!({ "transactionBase64": "" })).is_none());
}
