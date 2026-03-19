use flash_sdk::pool_config::Side;
use flash_sdk::PoolConfig;

#[test]
fn test_load_mainnet_configs() {
    let configs = PoolConfig::mainnet().unwrap();
    assert!(!configs.is_empty(), "Mainnet should have at least one pool");

    let crypto = configs.iter().find(|p| p.pool_name == "Crypto.1");
    assert!(crypto.is_some(), "Crypto.1 pool should exist on mainnet");
}

#[test]
fn test_load_devnet_configs() {
    let configs = PoolConfig::devnet().unwrap();
    assert!(!configs.is_empty(), "Devnet should have at least one pool");
}

#[test]
fn test_sol_market_exists_in_some_form() {
    let configs = PoolConfig::mainnet().unwrap();
    let mut sol_market_found = false;

    for pool in &configs {
        let sol_custody = pool.get_custody_by_symbol("SOL");
        if sol_custody.is_none() {
            continue;
        }
        let sol = sol_custody.unwrap();

        // SOL can be paired with various collateral tokens
        for market in &pool.markets {
            if market.target_custody == sol.custody_account
                || market.collateral_custody == sol.custody_account
            {
                sol_market_found = true;
                assert!(market.max_lev > 0, "Max leverage should be positive");
                break;
            }
        }
        if sol_market_found {
            break;
        }
    }

    assert!(sol_market_found, "SOL should appear in at least one market");
}

#[test]
fn test_crypto1_has_markets() {
    let configs = PoolConfig::mainnet().unwrap();
    let crypto = configs.iter().find(|p| p.pool_name == "Crypto.1").unwrap();
    assert!(!crypto.markets.is_empty(), "Crypto.1 should have markets");
    assert!(
        !crypto.custodies.is_empty(),
        "Crypto.1 should have custodies"
    );
    assert!(!crypto.tokens.is_empty(), "Crypto.1 should have tokens");
}

#[test]
fn test_find_token_usdc() {
    let configs = PoolConfig::mainnet().unwrap();
    let mut found = false;

    for pool in &configs {
        if let Some(token) = pool.get_token_by_symbol("USDC") {
            assert_eq!(token.decimals, 6, "USDC should have 6 decimals");
            assert!(token.is_stable, "USDC should be marked as stable");
            assert!(
                !token.pyth_price_id.is_empty(),
                "USDC should have a Pyth price ID"
            );
            found = true;
            break;
        }
    }

    assert!(found, "USDC token should exist in mainnet pools");
}

#[test]
fn test_find_token_btc() {
    let configs = PoolConfig::mainnet().unwrap();
    let mut found = false;

    for pool in &configs {
        if let Some(token) = pool.get_token_by_symbol("BTC") {
            assert_eq!(token.decimals, 8, "BTC should have 8 decimals");
            assert!(!token.is_stable, "BTC should not be stable");
            found = true;
            break;
        }
    }

    assert!(found, "BTC token should exist in mainnet pools");
}

#[test]
fn test_pool_has_address_lookup_tables() {
    let configs = PoolConfig::mainnet().unwrap();
    let crypto = configs.iter().find(|p| p.pool_name == "Crypto.1").unwrap();
    assert!(
        !crypto.address_lookup_table_addresses.is_empty(),
        "Crypto.1 should have ALT addresses"
    );
}

#[test]
fn test_side_enum_values() {
    assert_eq!(Side::Long.as_u8(), 1);
    assert_eq!(Side::Short.as_u8(), 2);
}
