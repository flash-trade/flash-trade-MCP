use anyhow::{Context, Result};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::core::rpc::RpcManager;
use crate::enrichment::order_enrichment::EnrichedOrder;
use crate::output::formatter::Formatter;

/// Discriminator for Order accounts.
const ORDER_DISCRIMINATOR: [u8; 8] = [134, 173, 223, 185, 77, 86, 28, 51];

#[allow(dead_code)]
const OWNER_OFFSET: usize = 8;
const MARKET_OFFSET: usize = 8 + 32;

pub async fn list_orders(
    address: Option<&str>,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let owner = resolve_owner(address, key_override, settings)?;
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;

    let program_id = resolve_program_id(&settings.cluster);
    let accounts = rpc.get_program_accounts_by_owner(&program_id, &owner, &ORDER_DISCRIMINATOR)?;

    if accounts.is_empty() {
        println!(
            "{}",
            formatter.success(&format!("No active orders for {owner}"))
        );
        return Ok(());
    }

    let mut enriched = Vec::new();
    for (pubkey, account) in &accounts {
        match enrich_order(pubkey, &account.data, &configs) {
            Ok(orders) => enriched.extend(orders),
            Err(e) => {
                eprintln!("Warning: Failed to parse order {pubkey}: {e}");
            }
        }
    }

    if enriched.is_empty() {
        println!(
            "{}",
            formatter.success(&format!("No active orders for {owner}"))
        );
        return Ok(());
    }

    println!("{}", formatter.orders(&enriched));
    Ok(())
}

fn enrich_order(
    pubkey: &Pubkey,
    data: &[u8],
    configs: &[flash_sdk::PoolConfig],
) -> Result<Vec<EnrichedOrder>> {
    if data.len() < 100 {
        anyhow::bail!("Order data too short");
    }

    let market_pk = Pubkey::try_from(&data[MARKET_OFFSET..MARKET_OFFSET + 32])
        .with_context(|| "Failed to parse market pubkey from order")?;

    let (target_sym, collateral_sym, side) = resolve_market_info(&market_pk, configs)?;
    let side_str = match side {
        flash_sdk::pool_config::Side::Long => "Long",
        flash_sdk::pool_config::Side::Short => "Short",
    };

    // For now, return a single summary entry per order account
    // Full parsing of limit_orders[5] + trigger_orders[10] arrays requires
    // exact struct layout knowledge which we'll refine during testing
    Ok(vec![EnrichedOrder {
        pubkey: pubkey.to_string(),
        market_symbol: format!("{target_sym}/{collateral_sym}"),
        order_type: "Order".into(),
        side: side_str.into(),
        trigger_price: 0.0,
        size_usd: 0.0,
        status: "Active".into(),
    }])
}

fn resolve_market_info(
    market_pk: &Pubkey,
    configs: &[flash_sdk::PoolConfig],
) -> Result<(String, String, flash_sdk::pool_config::Side)> {
    for pool in configs {
        for market in &pool.markets {
            if market.market_account == *market_pk {
                let target = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.target_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".into());
                let collateral = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.collateral_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".into());
                return Ok((target, collateral, market.side));
            }
        }
    }
    anyhow::bail!("Market {market_pk} not found in pool configs")
}

fn resolve_owner(
    address: Option<&str>,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<Pubkey> {
    if let Some(addr) = address {
        return Pubkey::from_str(addr).with_context(|| format!("Invalid address: {addr}"));
    }
    let keypair = crate::core::wallet::WalletManager::resolve(key_override, settings)?;
    Ok(solana_sdk::signer::Signer::pubkey(&keypair))
}

fn resolve_program_id(cluster: &str) -> Pubkey {
    match cluster {
        "devnet" => flash_sdk::constants::PROGRAM_ID_DEVNET,
        _ => flash_sdk::constants::PROGRAM_ID_MAINNET,
    }
}
