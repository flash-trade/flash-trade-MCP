use anyhow::Result;
use flash_sdk::PerpetualsClient;

use crate::commands::trading_common::*;
use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::core::rpc::RpcManager;
use crate::core::tx_engine::{compute_units, TxEngine};
use crate::core::wallet::WalletManager;
use crate::output::formatter::Formatter;

pub async fn execute(
    position_str: &str,
    amount: f64,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let position_pk = parse_pubkey(position_str)?;
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;

    let account = rpc.get_account(&position_pk)?;
    let (target_sym, collateral_sym, side, _) = position_market_from_data(&account.data, &configs)?;

    let market_match =
        PoolConfigManager::find_market_explicit(&configs, &target_sym, &collateral_sym, side)?;
    let pool_config = &market_match.pool_config;

    let collateral_native = token_to_native(amount, market_match.collateral_token.decimals);

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.add_collateral(
        &owner,
        &target_sym,
        &collateral_sym,
        collateral_native,
        &position_pk,
        side,
        pool_config,
    )?;

    print_preview(&[
        (
            "Operation",
            format!("Add Collateral to {target_sym}/{collateral_sym}"),
        ),
        ("Position", position_str.to_string()),
        ("Amount", format!("{amount} {collateral_sym}")),
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
        compute_units::ADD_COLLATERAL,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Collateral added!\n  Signature: {sig}"))
    );
    Ok(())
}
