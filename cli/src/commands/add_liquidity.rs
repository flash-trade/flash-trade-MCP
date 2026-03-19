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
    token_symbol: &str,
    amount: f64,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;

    let pool_config = PoolConfigManager::find_pool(&configs, pool_name)?;
    let token = pool_config
        .get_token_by_symbol(token_symbol)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "Token '{token_symbol}' not found in pool '{pool_name}'. Available: {}",
                pool_config
                    .tokens
                    .iter()
                    .map(|t| t.symbol.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;

    let amount_native = token_to_native(amount, token.decimals);

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);
    let ix_result = client.add_liquidity(
        &owner,
        token_symbol,
        amount_native,
        0, // min_lp_amount_out = 0 (accept any)
        pool_config,
        None, // no whitelist
    )?;

    print_preview(&[
        ("Operation", format!("Add Liquidity to {pool_name}")),
        ("Token", token_symbol.to_string()),
        ("Amount", format!("{amount} {token_symbol}")),
        ("LP Token", pool_config.staked_lp_token_symbol.clone()),
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
        compute_units::ADD_LIQUIDITY,
        settings.priority_fee,
    )
    .await?;

    println!(
        "{}",
        formatter.success(&format!("Liquidity added!\n  Signature: {sig}"))
    );
    Ok(())
}
