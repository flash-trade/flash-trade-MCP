// Live read-only smoke tests against the hosted V2 API. Network-dependent, so
// they are OPT-IN: set RUN_INTEGRATION=1 to run them. Without it each test
// returns early and passes, keeping `cargo test` offline-safe and CI-stable.
//
//   RUN_INTEGRATION=1 cargo test --test integration -- --nocapture
//
// Nothing here signs or submits — reads only.

use flash_cli::core::api::ApiClient;
use flash_cli::core::network::Network;

fn enabled() -> bool {
    std::env::var("RUN_INTEGRATION").is_ok()
}

#[tokio::test]
async fn health_is_ok() {
    if !enabled() {
        eprintln!("skipping (set RUN_INTEGRATION=1 to run live smoke)");
        return;
    }
    let api = ApiClient::new(&Network::resolve().expect("default network is valid https"));
    let h = api.health().await.expect("health should respond");
    assert_eq!(h.get("status").and_then(|s| s.as_str()), Some("ok"));
    // V2 runs the ER program.
    assert_eq!(h.get("program").and_then(|s| s.as_str()), Some("ER"));
}

#[tokio::test]
async fn prices_include_a_nonzero_sol() {
    if !enabled() {
        return;
    }
    let api = ApiClient::new(&Network::resolve().expect("default network is valid https"));
    let prices = api.prices().await.expect("prices should respond");
    let sol = prices
        .get("SOL")
        .and_then(|p| p.get("priceUi"))
        .and_then(|x| x.as_f64())
        .expect("SOL price present");
    assert!(sol > 0.0, "mainnet SOL price must be nonzero, got {sol}");
}

#[tokio::test]
async fn tokens_expose_mint_addresses() {
    if !enabled() {
        return;
    }
    let api = ApiClient::new(&Network::resolve().expect("default network is valid https"));
    let tokens = api.tokens().await.expect("tokens should respond");
    assert!(!tokens.is_empty(), "active pool must list tokens");
    for t in &tokens {
        assert!(!t.mint.is_empty(), "token {} is missing a mint", t.symbol);
    }
}
