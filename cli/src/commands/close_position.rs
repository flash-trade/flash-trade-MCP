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
    position_str: &str,
    percent: u8,
    slippage: Option<u16>,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    // The SDK's close_position always closes the entire position — it takes no size
    // delta or percent argument. Accepting `--percent` < 100 here and quietly closing
    // 100% would make users think they closed a fraction when they actually flattened
    // the whole position. Reject and point them at the right command instead.
    if percent != 100 {
        anyhow::bail!(
            "Partial close via `--percent` is not supported on `flash perps close`.\n\
             To close part of a position, use:\n  \
             flash perps decrease <position> <usd_amount>\n\
             where <usd_amount> is the USD size to remove (e.g. `50` trims $50 of size)."
        );
    }

    let position_pk = parse_pubkey(position_str)?;
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;
    let price_client = PriceClient::new();
    let slippage_bps = resolve_slippage(slippage, settings);

    // Fetch position account to determine market
    let account = rpc.get_account(&position_pk)?;
    let (target_sym, collateral_sym, side, _market_pk) =
        position_market_from_data(&account.data, &configs)?;

    // Fetch price and compute accept price
    let token = PoolConfigManager::find_token(&configs, &target_sym)?;
    let price_data = price_client.get_price(&token.pyth_price_id).await?;
    let accept_price = close_price_with_slippage(&price_data, &side, slippage_bps);

    // Resolve pool config
    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    // Build instructions
    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.close_position(
        &owner,
        &target_sym,
        &collateral_sym,
        accept_price,
        side,
        pool_config,
        Privilege::None,
        None,
        None,
    )?;

    // Preview
    let side_str = match side {
        flash_sdk::pool_config::Side::Long => "Long",
        flash_sdk::pool_config::Side::Short => "Short",
    };
    print_preview(&[
        (
            "Operation",
            format!("Close {side_str} {target_sym}/{collateral_sym}"),
        ),
        ("Position", position_str.to_string()),
        ("Close %", format!("{percent}%")),
        ("Mark Price", colors::format_price(price_data.price)),
        ("Slippage", format!("{slippage_bps} bps")),
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
        compute_units::CLOSE_POSITION,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Position closed!\n  Signature: {sig}"))
    );
    Ok(())
}
