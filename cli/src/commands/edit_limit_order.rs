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
    new_size: Option<f64>,
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

    // Fetch order account to determine market
    let account = rpc.get_account(&order_pk)?;
    let (target_sym, collateral_sym, side, _) = position_market_from_data(&account.data, &configs)?;

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    let token = PoolConfigManager::find_token(&configs, &target_sym)?;
    let price_data = price_client.get_price(&token.pyth_price_id).await?;

    let trigger_price = new_price.unwrap_or(price_data.price);
    let limit_oracle_price = OraclePrice {
        price: (trigger_price / 10f64.powi(price_data.expo)) as u64,
        exponent: price_data.expo,
    };

    let size_amount = if let Some(size_usd) = new_size {
        token_to_native(size_usd / trigger_price, market_match.target_token.decimals)
    } else {
        0 // 0 = keep existing size
    };

    let zero_price = OraclePrice {
        price: 0,
        exponent: 0,
    };

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.edit_limit_order(
        &owner,
        &target_sym,
        &collateral_sym,
        &collateral_sym, // reserve_symbol
        0,               // order_id (first limit order slot)
        limit_oracle_price,
        size_amount,
        zero_price, // stop_loss_price
        zero_price, // take_profit_price
        side,
        pool_config,
    )?;

    print_preview(&[
        (
            "Operation",
            format!("Edit Limit Order: {target_sym}/{collateral_sym}"),
        ),
        ("Order", order_str.to_string()),
        ("New Price", colors::format_price(trigger_price)),
        (
            "New Size",
            new_size
                .map(colors::format_usd)
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
        formatter.success(&format!("Limit order updated!\n  Signature: {sig}"))
    );
    Ok(())
}
