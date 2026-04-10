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
    position_str: &str,
    trigger_type: &crate::cli::orders::TriggerType,
    trigger_price: f64,
    quantity_pct: u8,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let position_pk = parse_pubkey(position_str)?;
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;
    let price_client = PriceClient::new();

    // Fetch position to determine market
    let account = rpc.get_account(&position_pk)?;
    let (target_sym, collateral_sym, side, _) = position_market_from_data(&account.data, &configs)?;

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    let token = PoolConfigManager::find_token(&configs, &target_sym)?;
    let price_data = price_client.get_price(&token.pyth_price_id).await?;

    let trigger_oracle_price = OraclePrice {
        price: (trigger_price / 10f64.powi(price_data.expo)) as u64,
        exponent: price_data.expo,
    };

    // Read position's size_amount (token units) from on-chain data
    // Position layout after 8-byte discriminator:
    //   owner(32) + market(32) + delegate(32) + open_time(8) + update_time(8)
    //   + entry_price { price: u64, exponent: i32 } (12 bytes)
    //   + size_amount(u64)
    let size_amount_offset = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 4; // = 132
    let position_size_amount = if size_amount_offset + 8 <= account.data.len() {
        u64::from_le_bytes(
            account.data[size_amount_offset..size_amount_offset + 8]
                .try_into()
                .unwrap_or([0; 8]),
        )
    } else {
        0
    };

    let delta_size_amount = if quantity_pct >= 100 {
        position_size_amount
    } else {
        position_size_amount * quantity_pct as u64 / 100
    };

    if delta_size_amount == 0 {
        anyhow::bail!("Could not determine position size for trigger order");
    }

    let is_stop_loss = matches!(trigger_type, crate::cli::orders::TriggerType::Sl);

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.place_trigger_order(
        &owner,
        &target_sym,
        &collateral_sym,
        side,
        trigger_oracle_price,
        delta_size_amount,
        is_stop_loss,
        pool_config,
    )?;

    let type_str = if is_stop_loss {
        "Stop Loss"
    } else {
        "Take Profit"
    };
    let side_str = match side {
        flash_sdk::pool_config::Side::Long => "Long",
        flash_sdk::pool_config::Side::Short => "Short",
    };
    print_preview(&[
        (
            "Operation",
            format!("{type_str}: {side_str} {target_sym}/{collateral_sym}"),
        ),
        ("Position", position_str.to_string()),
        ("Trigger Price", colors::format_price(trigger_price)),
        ("Quantity", format!("{quantity_pct}%")),
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
        formatter.success(&format!("{type_str} order placed!\n  Signature: {sig}"))
    );
    Ok(())
}
