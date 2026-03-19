use anyhow::Result;
use flash_sdk::pda;
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
    amount: f64,
    instant: bool,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(&settings.cluster)?;

    let pool_config = PoolConfigManager::find_pool(&configs, pool_name)?;
    let _amount_native = token_to_native(amount, pool_config.lp_decimals);

    let prog_id = program_id(&settings.cluster);
    let client = PerpetualsClient::new(prog_id, false);

    // FLP unstaking flow:
    //
    // deposit_stake → pending_activation
    // refresh_stake → active_amount (requires epoch boundary)
    // unstake_request → pending_deactivation (time-locked from active)
    //   OR unstake_instant → deactivated (instant with fee, from active)
    // withdraw_stake(deactivated=true) → FLP tokens back to wallet
    //
    // If FLP is still in pending_activation (just staked, epoch hasn't passed),
    // use withdraw_stake(pending_activation=true) to pull it back directly.

    // Step 1: Refresh stake to try moving pending_activation → active
    let (flp_stake_account, _) = pda::find_flp_stake(&prog_id, &owner, &pool_config.pool_address);
    let refresh_ix = client.refresh_stake("USDC", pool_config, &[flp_stake_account])?;
    let alt_pubkeys = PoolConfigManager::get_alts(pool_config);

    eprintln!("Refreshing stake account...");
    TxEngine::execute(
        &rpc, &refresh_ix, &keypair, &alt_pubkeys,
        compute_units::STAKE, settings.priority_fee,
    ).await?;

    // Step 2: Check stake state to decide which path
    let stake_data = rpc.get_account(&flp_stake_account)?;
    let offset = 8 + 32 + 32; // disc + owner + pool
    let pending_activation = read_u64_at(&stake_data.data, offset);
    let active_amount = read_u64_at(&stake_data.data, offset + 8);

    let (ix_result, mode) = if active_amount > 0 {
        // Active FLP exists — use unstake_request or unstake_instant
        let unstake_amt = std::cmp::min(_amount_native, active_amount);

        if instant {
            let ix = client.unstake_instant(
                &owner, "USDC", unstake_amt, pool_config, None,
            )?;
            (ix, "Instant unstake (from active)")
        } else {
            let ix = client.unstake_request(&owner, unstake_amt, pool_config)?;
            (ix, "Unstake request (from active, time-locked)")
        }
    } else if pending_activation > 0 {
        // FLP is still pending activation (epoch hasn't passed) —
        // withdraw directly from pending_activation
        let ix = client.withdraw_stake(&owner, true, false, pool_config)?;
        (ix, "Withdraw pending activation (no epoch passed yet)")
    } else {
        anyhow::bail!(
            "No staked FLP found. pending_activation={}, active_amount={}",
            pending_activation, active_amount
        );
    };

    print_preview(&[
        ("Operation", format!("Unstake FLP from {pool_name}")),
        ("Amount", format!("{amount} {}", pool_config.staked_lp_token_symbol)),
        ("Mode", mode.to_string()),
    ]);

    if !confirm("Submit transaction?")? {
        println!("Cancelled.");
        return Ok(());
    }

    let sig = TxEngine::execute(
        &rpc, &ix_result, &keypair, &alt_pubkeys,
        compute_units::UNSTAKE, settings.priority_fee,
    ).await?;

    println!(
        "{}",
        formatter.success(&format!("FLP unstaked ({mode})!\n  Signature: {sig}")),
    );
    Ok(())
}

fn read_u64_at(data: &[u8], offset: usize) -> u64 {
    if offset + 8 > data.len() { return 0; }
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap_or([0; 8]))
}
