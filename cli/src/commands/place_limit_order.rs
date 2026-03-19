use anyhow::Result;
use flash_sdk::types::OraclePrice;
use flash_sdk::PerpetualsClient;

use crate::commands::trading_common::*;
use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::core::prices::PriceClient;
use crate::core::rpc::RpcManager;
use crate::core::tx_engine::{compute_units, TxEngine};
use crate::core::wallet::WalletManager;
use crate::output::colors;
use crate::output::formatter::Formatter;

pub async fn execute(
    symbol: &str,
    side: &crate::cli::perps::Side,
    size_usd: f64,
    trigger_price: f64,
    leverage: f64,
    collateral_token: &str,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;
    let price_client = PriceClient::new();
    let sdk_side = cli_side_to_sdk(side);

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, symbol, collateral_token, sdk_side)
            .or_else(|_| PoolConfigManager::find_market(&configs, symbol, sdk_side))?;
    let pool_config = &market_match.pool_config;
    let actual_collateral = &market_match.collateral_token.symbol;

    // Fetch current price for reference
    let price_data = price_client
        .get_price(&market_match.target_token.pyth_price_id)
        .await?;

    // Build limit price as OraclePrice
    let limit_oracle_price = OraclePrice {
        price: (trigger_price / 10f64.powi(price_data.expo)) as u64,
        exponent: price_data.expo,
    };

    // Calculate reserve (collateral) and size amounts
    let collateral_usd = size_usd / leverage;
    let reserve_amount = token_to_native(collateral_usd, market_match.collateral_token.decimals);
    let size_amount = if trigger_price > 0.0 {
        token_to_native(size_usd / trigger_price, market_match.target_token.decimals)
    } else {
        anyhow::bail!("Trigger price must be > 0");
    };

    // Zero prices for optional TP/SL (not set during limit order placement)
    let zero_price = OraclePrice {
        price: 0,
        exponent: 0,
    };

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.place_limit_order(
        &owner,
        symbol,
        actual_collateral,
        actual_collateral, // reserve_symbol = collateral
        actual_collateral, // receive_symbol = collateral
        limit_oracle_price,
        reserve_amount,
        size_amount,
        zero_price, // stop_loss_price
        zero_price, // take_profit_price
        sdk_side,
        pool_config,
    )?;

    let side_str = match sdk_side {
        flash_sdk::pool_config::Side::Long => "Long",
        flash_sdk::pool_config::Side::Short => "Short",
    };
    print_preview(&[
        (
            "Operation",
            format!("Limit Order: {side_str} {symbol}/{actual_collateral}"),
        ),
        ("Size", colors::format_usd(size_usd)),
        ("Trigger Price", colors::format_price(trigger_price)),
        ("Leverage", format!("{leverage:.1}x")),
        (
            "Collateral",
            format!("{} {actual_collateral}", colors::format_usd(collateral_usd)),
        ),
        ("Current Price", colors::format_price(price_data.price)),
    ]);

    if !confirm("Submit transaction?")? {
        println!("Cancelled.");
        return Ok(());
    }

    let alt_pubkeys = PoolConfigManager::get_alts(pool_config);
    let sig = TxEngine::execute(
        &rpc,
        &ix_result,
        &keypair,
        &alt_pubkeys,
        compute_units::PLACE_LIMIT_ORDER,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Limit order placed!\n  Signature: {sig}"))
    );
    Ok(())
}
