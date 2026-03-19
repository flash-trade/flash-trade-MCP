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
    order_str: &str,
    new_price: Option<f64>,
    new_quantity: Option<u8>,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let order_pk = parse_pubkey(order_str)?;
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;
    let price_client = PriceClient::new();

    let account = rpc.get_account(&order_pk)?;
    let (target_sym, collateral_sym, side, _) = position_market_from_data(&account.data, &configs)?;

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    let token = PoolConfigManager::find_token(&configs, &target_sym)?;
    let price_data = price_client.get_price(&token.pyth_price_id).await?;

    let trigger_price = new_price.unwrap_or(price_data.price);
    let trigger_oracle_price = OraclePrice {
        price: (trigger_price / 10f64.powi(price_data.expo)) as u64,
        exponent: price_data.expo,
    };

    let delta_size_amount = match new_quantity {
        Some(pct) if pct >= 100 => u64::MAX,
        Some(pct) => usd_to_native(pct as f64),
        None => 0, // 0 = keep existing
    };

    // Default to TP for editing — the SDK needs this but the order itself stores the type
    let is_stop_loss = false;

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.edit_trigger_order(
        &owner,
        &target_sym,
        &collateral_sym,
        side,
        0, // order_id — first slot
        trigger_oracle_price,
        delta_size_amount,
        is_stop_loss,
        pool_config,
    )?;

    print_preview(&[
        (
            "Operation",
            format!("Edit Trigger Order: {target_sym}/{collateral_sym}"),
        ),
        ("Order", order_str.to_string()),
        ("New Price", colors::format_price(trigger_price)),
        (
            "Quantity",
            new_quantity
                .map(|q| format!("{q}%"))
                .unwrap_or_else(|| "(unchanged)".into()),
        ),
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
        formatter.success(&format!("Trigger order updated!\n  Signature: {sig}"))
    );
    Ok(())
}
