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
    usd_amount: f64,
    slippage: Option<u16>,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let position_pk = parse_pubkey(position_str)?;
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;
    let price_client = PriceClient::new();
    let slippage_bps = resolve_slippage(slippage, settings);

    let account = rpc.get_account(&position_pk)?;
    let (target_sym, collateral_sym, side, _) = position_market_from_data(&account.data, &configs)?;

    let token = PoolConfigManager::find_token(&configs, &target_sym)?;
    let price_data = price_client.get_price(&token.pyth_price_id).await?;
    let accept_price = price_with_slippage(&price_data, &side, slippage_bps);

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    let size_delta = usd_to_native(usd_amount);

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.increase_size(
        &owner,
        &target_sym,
        &collateral_sym,
        &position_pk,
        side,
        accept_price,
        size_delta,
        pool_config,
        Privilege::None,
        None,
        None,
    )?;

    let side_str = match side {
        flash_sdk::pool_config::Side::Long => "Long",
        flash_sdk::pool_config::Side::Short => "Short",
    };
    print_preview(&[
        (
            "Operation",
            format!("Increase {side_str} {target_sym}/{collateral_sym}"),
        ),
        ("Position", position_str.to_string()),
        ("Size Delta", colors::format_usd(usd_amount)),
        ("Mark Price", colors::format_price(price_data.price)),
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
        compute_units::OPEN_POSITION,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Position size increased!\n  Signature: {sig}"))
    );
    Ok(())
}
