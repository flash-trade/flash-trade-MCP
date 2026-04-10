use anyhow::Result;
use flash_sdk::PerpetualsClient;

use crate::commands::trading_common::*;
use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::core::rpc::RpcManager;
use crate::core::tx_engine::{compute_units, TxEngine};
use crate::core::wallet::WalletManager;
use crate::output::formatter::Formatter;

/// Cancel a single order by pubkey.
pub async fn cancel_single(
    order_str: &str,
    is_stop_loss: bool,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let order_pk = parse_pubkey(order_str)?;
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;

    let account = rpc.get_account(&order_pk)?;
    let (target_sym, collateral_sym, side, _) = position_market_from_data(&account.data, &configs)?;

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);

    let order_type_str = if is_stop_loss { "SL" } else { "TP" };
    let ix_result = client.cancel_trigger_order(
        &owner,
        &target_sym,
        &collateral_sym,
        side,
        0,
        is_stop_loss,
        pool_config,
    )?;

    print_preview(&[
        (
            "Operation",
            format!("Cancel {order_type_str}: {target_sym}/{collateral_sym}"),
        ),
        ("Order", order_str.to_string()),
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
        compute_units::CANCEL_ORDER,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Order cancelled!\n  Signature: {sig}"))
    );
    Ok(())
}

/// Cancel all trigger orders for a market symbol.
pub async fn cancel_all(
    symbol: &str,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;

    // Find market — try both sides
    let market_match =
        PoolConfigManager::find_market(&configs, symbol, flash_sdk::pool_config::Side::Long)
            .or_else(|_| {
                PoolConfigManager::find_market(
                    &configs,
                    symbol,
                    flash_sdk::pool_config::Side::Short,
                )
            })?;

    let pool_config = &market_match.pool_config;
    let target_sym = &market_match.target_custody.symbol;
    let collateral_sym = &market_match.collateral_custody.symbol;
    let side = market_match.market_config.side;

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result =
        client.cancel_all_trigger_orders(&owner, target_sym, collateral_sym, side, pool_config)?;

    print_preview(&[
        ("Operation", format!("Cancel All Orders: {symbol}")),
        ("Market", format!("{target_sym}/{collateral_sym}")),
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
        compute_units::CANCEL_ORDER,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!(
            "All orders cancelled for {symbol}!\n  Signature: {sig}"
        ))
    );
    Ok(())
}
