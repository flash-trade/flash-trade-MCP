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
    pool_name: &str,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;

    let pool_config = PoolConfigManager::find_pool(&configs, pool_name)?;

    // Collect rewards in USDC by default
    let reward_symbol = "USDC";

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.collect_stake_fees(
        &owner,
        reward_symbol,
        pool_config,
        None, // no token stake account
    )?;

    print_preview(&[
        (
            "Operation",
            format!("Collect Staking Rewards from {pool_name}"),
        ),
        ("Reward Token", reward_symbol.to_string()),
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
        compute_units::COLLECT_FEES,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Rewards collected!\n  Signature: {sig}"))
    );
    Ok(())
}
