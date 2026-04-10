use anyhow::Result;
use flash_sdk::types::Privilege;
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
    collateral_usd: f64,
    leverage: f64,
    collateral_token: &str,
    slippage: Option<u16>,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;
    let price_client = PriceClient::new();
    let sdk_side = cli_side_to_sdk(side);
    let slippage_bps = resolve_slippage(slippage, settings);

    // Resolve market — try user's collateral, fall back to auto-resolve
    let market_match =
        PoolConfigManager::find_market_explicit(&configs, symbol, collateral_token, sdk_side)
            .or_else(|_| PoolConfigManager::find_market(&configs, symbol, sdk_side))?;
    let pool_config = &market_match.pool_config;
    let actual_collateral = &market_match.collateral_token.symbol;

    // Fetch current price
    let price_data = price_client
        .get_price(&market_match.target_token.pyth_price_id)
        .await?;
    let accept_price = price_with_slippage(&price_data, &sdk_side, slippage_bps);

    // Calculate amounts
    let collateral_native = token_to_native(collateral_usd, market_match.collateral_token.decimals);
    // size_amount is in target token units based on current price
    let size_amount = if price_data.price > 0.0 {
        token_to_native(
            (collateral_usd * leverage) / price_data.price,
            market_match.target_token.decimals,
        )
    } else {
        anyhow::bail!("Price unavailable for {symbol}");
    };

    // Build instructions
    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.open_position(
        &owner,
        symbol,
        actual_collateral,
        accept_price,
        collateral_native,
        size_amount,
        sdk_side,
        pool_config,
        Privilege::None,
        None,
        None,
    )?;

    // Preview
    let side_str = match sdk_side {
        flash_sdk::pool_config::Side::Long => "Long",
        flash_sdk::pool_config::Side::Short => "Short",
    };
    print_preview(&[
        (
            "Operation",
            format!("Open {side_str} {symbol}/{actual_collateral}"),
        ),
        ("Size", colors::format_usd(collateral_usd * leverage)),
        (
            "Collateral",
            format!("{} {actual_collateral}", colors::format_usd(collateral_usd)),
        ),
        ("Leverage", format!("{leverage:.1}x")),
        ("Mark Price", colors::format_price(price_data.price)),
        ("Slippage", format!("{slippage_bps} bps")),
    ]);

    if !confirm("Submit transaction?")? {
        println!("Cancelled.");
        return Ok(());
    }

    // Execute
    let alt_pubkeys = PoolConfigManager::get_alts(pool_config);
    let sig = TxEngine::execute(
        &rpc,
        &ix_result,
        &keypair,
        &alt_pubkeys,
        compute_units::OPEN_POSITION,
        settings.priority_fee,
    )
    .await?;

    let position_pk =
        flash_sdk::pda::find_position(&prog_id, &owner, &market_match.market_config.market_account)
            .0;

    println!(
        "{}",
        formatter.success(&format!(
            "Position opened!\n  Signature: {sig}\n  Position: {position_pk}"
        ))
    );

    Ok(())
}
