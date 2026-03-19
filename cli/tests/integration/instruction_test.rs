use flash_sdk::constants::PROGRAM_ID_MAINNET;
use flash_sdk::pool_config::Side;
use flash_sdk::types::{OraclePrice, Privilege};
use flash_sdk::{PerpetualsClient, PoolConfig};
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

fn test_keypair() -> Keypair {
    Keypair::new()
}

fn mainnet_pool(name: &str) -> PoolConfig {
    let configs = PoolConfig::mainnet().unwrap();
    PoolConfig::from_ids_by_name(&configs, name, "mainnet-beta").unwrap()
}

fn mock_price() -> OraclePrice {
    OraclePrice {
        price: 9000000000, // $90 with exponent -8
        exponent: -8,
    }
}

#[test]
fn test_open_position_builds_instructions() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");

    let result = client.open_position(
        &owner.pubkey(),
        "SOL",
        "SOL",
        mock_price(),
        1_000_000_000, // 1 SOL collateral
        100_000_000,   // 0.1 SOL size
        Side::Long,
        &pool,
        Privilege::None,
        None,
        None,
    );

    assert!(
        result.is_ok(),
        "open_position should succeed: {:?}",
        result.err()
    );
    let ix_result = result.unwrap();
    assert!(
        !ix_result.instructions.is_empty(),
        "Should produce at least 1 instruction"
    );

    // At least one instruction should target the Flash program
    // (others may be System Program for WSOL wrapping)
    let has_flash_ix = ix_result
        .instructions
        .iter()
        .any(|ix| ix.program_id == PROGRAM_ID_MAINNET);
    assert!(
        has_flash_ix,
        "At least one instruction should target Flash program"
    );
}

#[test]
fn test_close_position_builds_instructions() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");

    let result = client.close_position(
        &owner.pubkey(),
        "SOL",
        "SOL",
        mock_price(),
        Side::Long,
        &pool,
        Privilege::None,
        None,
        None,
    );

    assert!(
        result.is_ok(),
        "close_position should succeed: {:?}",
        result.err()
    );
    let ix_result = result.unwrap();
    assert!(
        !ix_result.instructions.is_empty(),
        "Should produce at least 1 instruction"
    );
}

#[test]
fn test_add_collateral_builds_instructions() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");
    let position_pk = flash_sdk::pda::find_position(
        &PROGRAM_ID_MAINNET,
        &owner.pubkey(),
        &pool.markets[0].market_account,
    )
    .0;

    let result = client.add_collateral(
        &owner.pubkey(),
        "SOL",
        "SOL",
        500_000_000, // 0.5 SOL
        &position_pk,
        Side::Long,
        &pool,
    );

    assert!(
        result.is_ok(),
        "add_collateral should succeed: {:?}",
        result.err()
    );
    let ix_result = result.unwrap();
    assert!(
        !ix_result.instructions.is_empty(),
        "Should produce at least 1 instruction"
    );
}

#[test]
fn test_remove_collateral_builds_instructions() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");
    let position_pk = flash_sdk::pda::find_position(
        &PROGRAM_ID_MAINNET,
        &owner.pubkey(),
        &pool.markets[0].market_account,
    )
    .0;

    let result = client.remove_collateral(
        &owner.pubkey(),
        "SOL",
        "SOL",
        1_000_000, // 1 USD worth
        &position_pk,
        Side::Long,
        &pool,
    );

    assert!(
        result.is_ok(),
        "remove_collateral should succeed: {:?}",
        result.err()
    );
    let ix_result = result.unwrap();
    assert!(
        !ix_result.instructions.is_empty(),
        "Should produce at least 1 instruction"
    );
}

#[test]
fn test_increase_size_builds_instructions() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");
    let position_pk = flash_sdk::pda::find_position(
        &PROGRAM_ID_MAINNET,
        &owner.pubkey(),
        &pool.markets[0].market_account,
    )
    .0;

    let result = client.increase_size(
        &owner.pubkey(),
        "SOL",
        "SOL",
        &position_pk,
        Side::Long,
        mock_price(),
        5_000_000, // 5 USD size delta
        &pool,
        Privilege::None,
        None,
        None,
    );

    assert!(
        result.is_ok(),
        "increase_size should succeed: {:?}",
        result.err()
    );
    assert!(!result.unwrap().instructions.is_empty());
}

#[test]
fn test_decrease_size_builds_instructions() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");
    let position_pk = flash_sdk::pda::find_position(
        &PROGRAM_ID_MAINNET,
        &owner.pubkey(),
        &pool.markets[0].market_account,
    )
    .0;

    let result = client.decrease_size(
        &owner.pubkey(),
        "SOL",
        "SOL",
        &position_pk,
        Side::Long,
        mock_price(),
        2_000_000, // 2 USD size delta
        &pool,
        Privilege::None,
        None,
        None,
    );

    assert!(
        result.is_ok(),
        "decrease_size should succeed: {:?}",
        result.err()
    );
    assert!(!result.unwrap().instructions.is_empty());
}

#[test]
fn test_open_short_with_usdc_collateral() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");

    let result = client.open_position(
        &owner.pubkey(),
        "SOL",
        "USDC",
        mock_price(),
        5_000_000, // 5 USDC collateral
        5_000_000, // 5 USD size
        Side::Short,
        &pool,
        Privilege::None,
        None,
        None,
    );

    assert!(
        result.is_ok(),
        "SOL short with USDC should succeed: {:?}",
        result.err()
    );
    assert!(!result.unwrap().instructions.is_empty());
}

#[test]
fn test_invalid_token_returns_error() {
    let client = PerpetualsClient::new(PROGRAM_ID_MAINNET, false);
    let owner = test_keypair();
    let pool = mainnet_pool("Crypto.1");

    let result = client.open_position(
        &owner.pubkey(),
        "NONEXISTENT",
        "USDC",
        mock_price(),
        1_000_000,
        1_000_000,
        Side::Long,
        &pool,
        Privilege::None,
        None,
        None,
    );

    assert!(result.is_err(), "Invalid token should return error");
}
