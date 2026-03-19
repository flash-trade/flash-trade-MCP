use flash_sdk::constants::USD_DECIMALS;
use flash_sdk::pool_config::Side;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct EnrichedPosition {
    pub pubkey: String,
    pub market_symbol: String,
    pub side: String,
    pub size_usd: f64,
    pub collateral_usd: f64,
    pub collateral_token: String,
    pub entry_price: f64,
    pub mark_price: f64,
    pub pnl_usd: f64,
    pub pnl_percent: f64,
    pub leverage: f64,
    pub liquidation_price: f64,
}

/// Convert native USD amount (6 decimals) to human-readable f64.
pub fn native_usd_to_ui(native: u64) -> f64 {
    native as f64 / 10f64.powi(USD_DECIMALS)
}

/// Convert OraclePrice {price, exponent} to human-readable f64.
pub fn oracle_price_to_ui(price: u64, exponent: i32) -> f64 {
    price as f64 * 10f64.powi(exponent)
}

/// Simple PnL calculation without needing full on-chain account data.
/// This is an approximation — for exact PnL use sync_functions::get_pnl
/// which requires fetching custody and pool accounts.
pub fn calculate_simple_pnl(size_usd: f64, entry_price: f64, mark_price: f64, side: &Side) -> f64 {
    if entry_price <= 0.0 {
        return 0.0;
    }
    let price_change_ratio = (mark_price - entry_price) / entry_price;
    match side {
        Side::Long => size_usd * price_change_ratio,
        Side::Short => size_usd * (-price_change_ratio),
    }
}

/// Simple leverage: size / collateral.
pub fn calculate_simple_leverage(size_usd: f64, collateral_usd: f64) -> f64 {
    if collateral_usd <= 0.0 {
        return 0.0;
    }
    size_usd / collateral_usd
}

/// Approximate liquidation price.
/// For Long: liq_price = entry_price * (1 - 1/leverage + fees)
/// For Short: liq_price = entry_price * (1 + 1/leverage - fees)
/// This is approximate — doesn't account for borrow fees accrued since open.
pub fn calculate_approx_liquidation_price(entry_price: f64, leverage: f64, side: &Side) -> f64 {
    if leverage <= 0.0 || entry_price <= 0.0 {
        return 0.0;
    }
    let maintenance_margin = 0.01; // ~1% maintenance margin (approximation)
    let close_fee = 0.001; // ~0.1% close fee (approximation)
    let margin_fraction = 1.0 / leverage;

    match side {
        Side::Long => entry_price * (1.0 - margin_fraction + maintenance_margin + close_fee),
        Side::Short => entry_price * (1.0 + margin_fraction - maintenance_margin - close_fee),
    }
}
