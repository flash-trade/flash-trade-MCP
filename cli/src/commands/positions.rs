use anyhow::{Context, Result};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::core::prices::PriceClient;
use crate::core::rpc::RpcManager;
use crate::enrichment::position_enrichment::{
    calculate_approx_liquidation_price, calculate_simple_leverage, calculate_simple_pnl,
    native_usd_to_ui, oracle_price_to_ui, EnrichedPosition,
};
use crate::output::formatter::Formatter;
use flash_sdk::pool_config::Side;

/// Discriminator for Position accounts (first 8 bytes).
/// From the Anchor IDL.
const POSITION_DISCRIMINATOR: [u8; 8] = [170, 188, 143, 228, 122, 64, 247, 208];

/// Position fields at known byte offsets after the 8-byte discriminator:
/// offset 0: owner (Pubkey, 32 bytes)
/// offset 32: market (Pubkey, 32 bytes)
/// ...then more fields
#[allow(dead_code)]
const OWNER_OFFSET: usize = 8;
const MARKET_OFFSET: usize = 8 + 32;

pub async fn list_positions(
    address: Option<&str>,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let owner = resolve_owner(address, key_override, settings)?;
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;
    let price_client = PriceClient::new();

    let program_id = resolve_program_id_pub(&settings.cluster);
    let accounts =
        rpc.get_program_accounts_by_owner(&program_id, &owner, &POSITION_DISCRIMINATOR)?;

    if accounts.is_empty() {
        println!(
            "{}",
            formatter.success(&format!("No open positions for {owner}"))
        );
        return Ok(());
    }

    let mut enriched = Vec::new();
    for (pubkey, account) in &accounts {
        match enrich_position(pubkey, &account.data, &configs, &price_client).await {
            Ok(ep) => enriched.push(ep),
            Err(e) => {
                eprintln!("Warning: Failed to enrich position {pubkey}: {e}");
            }
        }
    }

    enriched.sort_by(|a, b| {
        b.size_usd
            .partial_cmp(&a.size_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    println!("{}", formatter.positions(&enriched));
    Ok(())
}

pub async fn show_position(
    pubkey_str: &str,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let pubkey =
        Pubkey::from_str(pubkey_str).with_context(|| format!("Invalid pubkey: {pubkey_str}"))?;
    let rpc = RpcManager::new(settings)?;
    let configs = PoolConfigManager::load(settings)?;
    let price_client = PriceClient::new();

    let account = rpc.get_account(&pubkey)?;
    let ep = enrich_position(&pubkey, &account.data, &configs, &price_client).await?;

    println!("{}", formatter.position_detail(&ep));
    Ok(())
}

async fn enrich_position(
    pubkey: &Pubkey,
    data: &[u8],
    configs: &[flash_sdk::PoolConfig],
    price_client: &PriceClient,
) -> Result<EnrichedPosition> {
    // Parse key fields from raw bytes (avoiding full deserialization complexity)
    if data.len() < 200 {
        anyhow::bail!("Position account data too short: {} bytes", data.len());
    }

    let market_pk = Pubkey::try_from(&data[MARKET_OFFSET..MARKET_OFFSET + 32])
        .with_context(|| "Failed to parse market pubkey from position")?;

    // Skip delegate (32 bytes), open_time (8), update_time (8)
    let fields_offset = MARKET_OFFSET + 32 + 32 + 8 + 8;

    // entry_price: OraclePrice { price: u64, exponent: i32 } — but IDL encoding might differ
    // Use the fixed offsets based on the Position struct layout
    let entry_price_raw = read_u64(data, fields_offset);
    let entry_exponent = read_i32(data, fields_offset + 8);

    let _size_amount = read_u64(data, fields_offset + 12);
    let size_usd = read_u64(data, fields_offset + 20);
    // Skip locked_amount(8), locked_usd(8), price_impact_usd(8)
    let collateral_usd = read_u64(data, fields_offset + 20 + 8 + 8 + 8 + 8);

    // Find which pool/market this position belongs to
    let (target_sym, collateral_sym, side) = resolve_market_info(&market_pk, configs)?;

    // Fetch current price
    let token = PoolConfigManager::find_token(configs, &target_sym)?;
    let price_data = price_client.get_price(&token.pyth_price_id).await?;

    let entry_price_ui = oracle_price_to_ui(entry_price_raw, entry_exponent);
    let size_usd_ui = native_usd_to_ui(size_usd);
    let collateral_usd_ui = native_usd_to_ui(collateral_usd);
    let mark_price = price_data.price;

    let pnl = calculate_simple_pnl(size_usd_ui, entry_price_ui, mark_price, &side);
    let pnl_pct = if collateral_usd_ui > 0.0 {
        (pnl / collateral_usd_ui) * 100.0
    } else {
        0.0
    };
    let leverage = calculate_simple_leverage(size_usd_ui, collateral_usd_ui);
    let liq_price = calculate_approx_liquidation_price(entry_price_ui, leverage, &side);

    Ok(EnrichedPosition {
        pubkey: pubkey.to_string(),
        market_symbol: format!("{target_sym}/{collateral_sym}"),
        side: match side {
            Side::Long => "Long".into(),
            Side::Short => "Short".into(),
        },
        size_usd: size_usd_ui,
        collateral_usd: collateral_usd_ui,
        collateral_token: collateral_sym,
        entry_price: entry_price_ui,
        mark_price,
        pnl_usd: pnl,
        pnl_percent: pnl_pct,
        leverage,
        liquidation_price: liq_price,
    })
}

fn resolve_market_info(
    market_pk: &Pubkey,
    configs: &[flash_sdk::PoolConfig],
) -> Result<(String, String, Side)> {
    for pool in configs {
        for market in &pool.markets {
            if market.market_account == *market_pk {
                let target_sym = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.target_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".into());
                let collateral_sym = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.collateral_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".into());
                return Ok((target_sym, collateral_sym, market.side));
            }
        }
        // Also check deprecated markets
        for market in &pool.markets_deprecated {
            if market.market_account == *market_pk {
                let target_sym = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.target_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".into());
                let collateral_sym = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.collateral_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".into());
                return Ok((target_sym, collateral_sym, market.side));
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

pub fn resolve_program_id_pub(cluster: &str) -> Pubkey {
    match cluster {
        "devnet" => flash_sdk::constants::PROGRAM_ID_DEVNET,
        _ => flash_sdk::constants::PROGRAM_ID_MAINNET,
    }
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    if offset + 8 > data.len() {
        return 0;
    }
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap_or([0; 8]))
}

fn read_i32(data: &[u8], offset: usize) -> i32 {
    if offset + 4 > data.len() {
        return 0;
    }
    i32::from_le_bytes(data[offset..offset + 4].try_into().unwrap_or([0; 4]))
}
