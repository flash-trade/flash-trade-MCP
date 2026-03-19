use anyhow::{Context, Result};
use flash_sdk::pool_config::Side;
use flash_sdk::types::OraclePrice;
use flash_sdk::PoolConfig;
use solana_sdk::pubkey::Pubkey;
use std::io::{self, Write};
use std::str::FromStr;

use crate::core::config::Settings;
use crate::core::prices::PriceData;

/// Convert a CLI side string to SDK Side enum.
pub fn cli_side_to_sdk(side: &crate::cli::perps::Side) -> Side {
    match side {
        crate::cli::perps::Side::Long => Side::Long,
        crate::cli::perps::Side::Short => Side::Short,
    }
}

/// Build an OraclePrice with slippage applied.
/// For Long (buying): accept a higher price → price * (1 + slippage)
/// For Short (selling): accept a lower price → price * (1 - slippage)
pub fn price_with_slippage(price_data: &PriceData, side: &Side, slippage_bps: u16) -> OraclePrice {
    let slippage_factor = slippage_bps as f64 / 10_000.0;
    let adjusted = match side {
        Side::Long => price_data.raw_price as f64 * (1.0 + slippage_factor),
        Side::Short => price_data.raw_price as f64 * (1.0 - slippage_factor),
    };
    OraclePrice {
        price: adjusted.abs() as u64,
        exponent: price_data.expo,
    }
}

/// Build an OraclePrice for closing (opposite direction).
/// Closing a Long = selling → accept lower price
/// Closing a Short = buying → accept higher price
pub fn close_price_with_slippage(
    price_data: &PriceData,
    position_side: &Side,
    slippage_bps: u16,
) -> OraclePrice {
    let opposite = match position_side {
        Side::Long => Side::Short,
        Side::Short => Side::Long,
    };
    price_with_slippage(price_data, &opposite, slippage_bps)
}

/// Resolve slippage: CLI flag > config default.
pub fn resolve_slippage(slippage_flag: Option<u16>, settings: &Settings) -> u16 {
    slippage_flag.unwrap_or(settings.default_slippage_bps)
}

/// Parse a pubkey from string.
pub fn parse_pubkey(s: &str) -> Result<Pubkey> {
    Pubkey::from_str(s).with_context(|| format!("Invalid pubkey: {s}"))
}

/// Resolve program ID from cluster.
pub fn program_id(cluster: &str) -> Pubkey {
    match cluster {
        "devnet" => flash_sdk::constants::PROGRAM_ID_DEVNET,
        _ => flash_sdk::constants::PROGRAM_ID_MAINNET,
    }
}

/// Convert USD amount (human-readable) to native u64 (6 decimals).
pub fn usd_to_native(usd: f64) -> u64 {
    (usd * 1_000_000.0) as u64
}

/// Convert token amount to native u64 given decimals.
pub fn token_to_native(amount: f64, decimals: u8) -> u64 {
    (amount * 10f64.powi(decimals as i32)) as u64
}

/// Prompt user for confirmation. Returns true if confirmed.
pub fn confirm(message: &str) -> Result<bool> {
    print!("{message} [y/N]: ");
    io::stdout().flush()?;
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    Ok(input.trim().eq_ignore_ascii_case("y") || input.trim().eq_ignore_ascii_case("yes"))
}

/// Display a transaction preview table.
pub fn print_preview(fields: &[(&str, String)]) {
    use comfy_table::{ContentArrangement, Table};
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Field", "Value"]);
    for (k, v) in fields {
        table.add_row(vec![k.to_string(), v.clone()]);
    }
    println!("{table}");
}

/// Resolve position's market info from the market pubkey stored at offset 40 in position data.
pub fn position_market_from_data(
    data: &[u8],
    configs: &[PoolConfig],
) -> Result<(String, String, Side, Pubkey)> {
    if data.len() < 72 {
        anyhow::bail!("Position data too short");
    }
    let market_pk =
        Pubkey::try_from(&data[40..72]).with_context(|| "Failed to parse market pubkey")?;

    for pool in configs {
        for market in &pool.markets {
            if market.market_account == market_pk {
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
                return Ok((target, collateral, market.side, market_pk));
            }
        }
    }
    anyhow::bail!("Market {market_pk} not found in pool configs")
}
