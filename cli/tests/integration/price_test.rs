use flash_sdk::PoolConfig;

/// Fetch a real price from Pyth Hermes and verify it's valid.
/// This test requires network access.
#[tokio::test]
#[ignore] // Run explicitly with: cargo test --test integration -- --ignored
async fn test_pyth_hermes_sol_price() {
    let configs = PoolConfig::mainnet().unwrap();
    let sol_token = configs
        .iter()
        .flat_map(|p| p.tokens.iter())
        .find(|t| t.symbol == "SOL")
        .expect("SOL token should exist");

    let client = reqwest::Client::new();
    let clean_id = sol_token.pyth_price_id.trim_start_matches("0x");
    let url = format!("https://hermes.pyth.network/v2/updates/price/latest?ids[]={clean_id}");

    let resp: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .expect("Hermes request should succeed")
        .json()
        .await
        .expect("Response should be JSON");

    let parsed = &resp["parsed"];
    assert!(parsed.is_array(), "Response should have parsed array");
    assert!(
        !parsed.as_array().unwrap().is_empty(),
        "Should have at least one price entry"
    );

    let price_str = parsed[0]["price"]["price"]
        .as_str()
        .expect("Price should be string");
    let price: i64 = price_str.parse().expect("Price should be parseable");
    assert!(price > 0, "SOL price should be positive, got {price}");

    let expo = parsed[0]["price"]["expo"]
        .as_i64()
        .expect("Expo should be i64");
    assert!(expo < 0, "Exponent should be negative, got {expo}");

    let ui_price = price as f64 * 10f64.powi(expo as i32);
    assert!(
        ui_price > 1.0 && ui_price < 10000.0,
        "SOL price should be between $1 and $10000, got ${ui_price}"
    );
}

#[tokio::test]
#[ignore]
async fn test_pyth_hermes_batch_prices() {
    let configs = PoolConfig::mainnet().unwrap();
    let tokens: Vec<_> = configs
        .iter()
        .flat_map(|p| p.tokens.iter())
        .filter(|t| ["SOL", "BTC", "ETH"].contains(&t.symbol.as_str()))
        .collect();

    assert!(tokens.len() >= 3, "Should find SOL, BTC, ETH tokens");

    let ids: Vec<String> = tokens
        .iter()
        .map(|t| format!("ids[]={}", t.pyth_price_id.trim_start_matches("0x")))
        .collect();

    let url = format!(
        "https://hermes.pyth.network/v2/updates/price/latest?{}",
        ids.join("&")
    );

    let client = reqwest::Client::new();
    let resp: serde_json::Value = client.get(&url).send().await.unwrap().json().await.unwrap();

    let parsed = resp["parsed"].as_array().unwrap();
    assert!(
        parsed.len() >= 3,
        "Should return at least 3 prices, got {}",
        parsed.len()
    );
}
