use flash_sdk::PoolConfig;

use crate::cli::OutputFormat;
use crate::commands::pools::PoolSummary;
use crate::commands::portfolio::PortfolioSummary;
use crate::core::pool_config::MarketSummary;
use crate::enrichment::order_enrichment::EnrichedOrder;
use crate::enrichment::position_enrichment::EnrichedPosition;
use crate::output::tables;

pub struct Formatter {
    pub format: OutputFormat,
}

impl Formatter {
    pub fn new(format: OutputFormat) -> Self {
        Self { format }
    }

    pub fn is_json(&self) -> bool {
        matches!(self.format, OutputFormat::Json)
    }

    pub fn markets(&self, markets: &[MarketSummary]) -> String {
        if self.is_json() {
            let items: Vec<serde_json::Value> = markets
                .iter()
                .map(|m| {
                    let side_str = match m.side {
                        flash_sdk::pool_config::Side::Long => "Long",
                        flash_sdk::pool_config::Side::Short => "Short",
                    };
                    serde_json::json!({
                        "symbol": m.symbol,
                        "pool": m.pool_name,
                        "side": side_str,
                        "collateral": m.collateral_symbol,
                        "maxLeverage": m.max_leverage,
                        "marketPubkey": m.market_pubkey.to_string(),
                    })
                })
                .collect();
            serde_json::to_string_pretty(&items).unwrap_or_default()
        } else {
            tables::markets_table(markets).to_string()
        }
    }

    pub fn positions(&self, positions: &[EnrichedPosition]) -> String {
        if self.is_json() {
            serde_json::to_string_pretty(positions).unwrap_or_default()
        } else {
            tables::positions_table(positions).to_string()
        }
    }

    pub fn position_detail(&self, position: &EnrichedPosition) -> String {
        if self.is_json() {
            serde_json::to_string_pretty(position).unwrap_or_default()
        } else {
            tables::position_detail_table(position).to_string()
        }
    }

    pub fn orders(&self, orders: &[EnrichedOrder]) -> String {
        if self.is_json() {
            serde_json::to_string_pretty(orders).unwrap_or_default()
        } else {
            tables::orders_table(orders).to_string()
        }
    }

    pub fn pools(&self, pools: &[PoolSummary]) -> String {
        if self.is_json() {
            let items: Vec<serde_json::Value> = pools
                .iter()
                .map(|p| {
                    serde_json::json!({
                        "name": p.name,
                        "address": p.address,
                        "lpSymbol": p.lp_symbol,
                        "custodies": p.num_custodies,
                        "markets": p.num_markets,
                        "deprecated": p.deprecated,
                    })
                })
                .collect();
            serde_json::to_string_pretty(&items).unwrap_or_default()
        } else {
            tables::pools_table(pools).to_string()
        }
    }

    pub fn pool_detail(&self, summary: &PoolSummary, pool: &PoolConfig) -> String {
        if self.is_json() {
            let tokens: Vec<serde_json::Value> = pool
                .tokens
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "symbol": t.symbol,
                        "decimals": t.decimals,
                        "isStable": t.is_stable,
                        "mint": t.mint_key.to_string(),
                    })
                })
                .collect();
            serde_json::to_string_pretty(&serde_json::json!({
                "name": summary.name,
                "address": summary.address,
                "lpSymbol": summary.lp_symbol,
                "custodies": summary.num_custodies,
                "markets": summary.num_markets,
                "deprecated": summary.deprecated,
                "tokens": tokens,
            }))
            .unwrap_or_default()
        } else {
            tables::pool_detail_table(summary, pool).to_string()
        }
    }

    pub fn portfolio(&self, summary: &PortfolioSummary) -> String {
        if self.is_json() {
            serde_json::to_string_pretty(&serde_json::json!({
                "wallet": summary.wallet,
                "solBalance": summary.sol_balance,
                "numPositions": summary.num_positions,
                "totalSizeUsd": summary.total_size_usd,
                "totalCollateralUsd": summary.total_collateral_usd,
                "totalPnlUsd": summary.total_pnl_usd,
                "totalPnlPercent": summary.total_pnl_percent,
            }))
            .unwrap_or_default()
        } else {
            tables::portfolio_table(summary).to_string()
        }
    }

    pub fn price(&self, symbol: &str, price: f64, confidence: f64, staleness_secs: u64) -> String {
        if self.is_json() {
            serde_json::to_string_pretty(&serde_json::json!({
                "symbol": symbol,
                "price": price,
                "confidence": confidence,
                "stalenessSecs": staleness_secs,
            }))
            .unwrap_or_default()
        } else {
            tables::price_table(symbol, price, confidence, staleness_secs).to_string()
        }
    }

    pub fn settings(&self, settings: &[(String, String)]) -> String {
        if self.is_json() {
            let obj: serde_json::Map<String, serde_json::Value> = settings
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect();
            serde_json::to_string_pretty(&serde_json::Value::Object(obj)).unwrap_or_default()
        } else {
            tables::settings_table(settings).to_string()
        }
    }

    pub fn keys(&self, keys: &[(String, String)]) -> String {
        if self.is_json() {
            let items: Vec<serde_json::Value> = keys
                .iter()
                .map(|(name, pubkey)| serde_json::json!({ "name": name, "pubkey": pubkey }))
                .collect();
            serde_json::to_string_pretty(&items).unwrap_or_default()
        } else {
            tables::keys_table(keys).to_string()
        }
    }

    pub fn success(&self, message: &str) -> String {
        if self.is_json() {
            serde_json::to_string_pretty(&serde_json::json!({
                "status": "success",
                "message": message,
            }))
            .unwrap_or_default()
        } else {
            message.to_string()
        }
    }
}
