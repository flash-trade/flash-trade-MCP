use comfy_table::{ContentArrangement, Table};
use flash_sdk::PoolConfig;

use crate::commands::pools::PoolSummary;
use crate::commands::portfolio::PortfolioSummary;
use crate::core::pool_config::MarketSummary;
use crate::enrichment::order_enrichment::EnrichedOrder;
use crate::enrichment::position_enrichment::EnrichedPosition;
use crate::output::colors;

pub fn markets_table(markets: &[MarketSummary]) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Market", "Pool", "Side", "Collateral", "Max Leverage"]);

    for m in markets {
        let side_str = match m.side {
            flash_sdk::pool_config::Side::Long => "Long",
            flash_sdk::pool_config::Side::Short => "Short",
        };
        table.add_row(vec![
            m.symbol.clone(),
            m.pool_name.clone(),
            colors::color_side(side_str),
            m.collateral_symbol.clone(),
            format!("{}x", m.max_leverage),
        ]);
    }

    table
}

pub fn positions_table(positions: &[EnrichedPosition]) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec![
        "Market",
        "Side",
        "Size USD",
        "Collateral",
        "Leverage",
        "Entry",
        "Mark",
        "PnL",
        "Liq. Price",
    ]);

    for p in positions {
        table.add_row(vec![
            p.market_symbol.clone(),
            colors::color_side(&p.side),
            colors::format_usd(p.size_usd),
            format!(
                "{} {}",
                colors::format_usd(p.collateral_usd),
                p.collateral_token
            ),
            colors::color_leverage(p.leverage),
            colors::format_price(p.entry_price),
            colors::format_price(p.mark_price),
            format!(
                "{} ({})",
                colors::color_pnl(p.pnl_usd),
                colors::color_pnl_percent(p.pnl_percent)
            ),
            colors::format_price(p.liquidation_price),
        ]);
    }

    table
}

pub fn position_detail_table(p: &EnrichedPosition) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Field", "Value"]);

    let rows = vec![
        ("Position", p.pubkey.clone()),
        ("Market", p.market_symbol.clone()),
        ("Side", colors::color_side(&p.side)),
        ("Size USD", colors::format_usd(p.size_usd)),
        (
            "Collateral",
            format!(
                "{} {}",
                colors::format_usd(p.collateral_usd),
                p.collateral_token
            ),
        ),
        ("Leverage", colors::color_leverage(p.leverage)),
        ("Entry Price", colors::format_price(p.entry_price)),
        ("Mark Price", colors::format_price(p.mark_price)),
        (
            "PnL",
            format!(
                "{} ({})",
                colors::color_pnl(p.pnl_usd),
                colors::color_pnl_percent(p.pnl_percent)
            ),
        ),
        (
            "Liquidation Price",
            colors::format_price(p.liquidation_price),
        ),
    ];

    for (field, value) in rows {
        table.add_row(vec![field.to_string(), value]);
    }

    table
}

pub fn orders_table(orders: &[EnrichedOrder]) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec![
        "Order", "Type", "Market", "Side", "Trigger", "Size USD", "Status",
    ]);

    for o in orders {
        table.add_row(vec![
            truncate_pubkey(&o.pubkey),
            o.order_type.clone(),
            o.market_symbol.clone(),
            colors::color_side(&o.side),
            if o.trigger_price > 0.0 {
                colors::format_price(o.trigger_price)
            } else {
                "-".into()
            },
            if o.size_usd > 0.0 {
                colors::format_usd(o.size_usd)
            } else {
                "-".into()
            },
            o.status.clone(),
        ]);
    }

    table
}

pub fn pools_table(pools: &[PoolSummary]) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Pool", "LP Token", "Custodies", "Markets", "Status"]);

    for p in pools {
        let status = if p.deprecated { "Deprecated" } else { "Active" };
        table.add_row(vec![
            p.name.clone(),
            p.lp_symbol.clone(),
            p.num_custodies.to_string(),
            p.num_markets.to_string(),
            status.to_string(),
        ]);
    }

    table
}

pub fn pool_detail_table(summary: &PoolSummary, pool: &PoolConfig) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Field", "Value"]);

    table.add_row(vec!["Pool Name", &summary.name]);
    table.add_row(vec!["Address", &summary.address]);
    table.add_row(vec!["LP Token", &summary.lp_symbol]);
    table.add_row(vec!["Custodies", &summary.num_custodies.to_string()]);
    table.add_row(vec!["Markets", &summary.num_markets.to_string()]);
    table.add_row(vec![
        "Status",
        if summary.deprecated {
            "Deprecated"
        } else {
            "Active"
        },
    ]);

    table.add_row(vec!["", ""]);
    table.add_row(vec!["--- Tokens ---", ""]);
    for token in &pool.tokens {
        table.add_row(vec![
            &token.symbol,
            &format!("decimals={}, stable={}", token.decimals, token.is_stable),
        ]);
    }

    table
}

pub fn portfolio_table(summary: &PortfolioSummary) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Field", "Value"]);

    table.add_row(vec!["Wallet".to_string(), summary.wallet.clone()]);
    table.add_row(vec![
        "SOL Balance".to_string(),
        format!("{:.4} SOL", summary.sol_balance),
    ]);
    table.add_row(vec![
        "Open Positions".to_string(),
        summary.num_positions.to_string(),
    ]);
    table.add_row(vec![
        "Total Size".to_string(),
        colors::format_usd(summary.total_size_usd),
    ]);
    table.add_row(vec![
        "Total Collateral".to_string(),
        colors::format_usd(summary.total_collateral_usd),
    ]);
    table.add_row(vec![
        "Total PnL".to_string(),
        format!(
            "{} ({})",
            colors::color_pnl(summary.total_pnl_usd),
            colors::color_pnl_percent(summary.total_pnl_percent),
        ),
    ]);

    table
}

pub fn price_table(symbol: &str, price: f64, confidence: f64, staleness_secs: u64) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Symbol", "Price", "Confidence", "Updated"]);
    table.add_row(vec![
        symbol.to_string(),
        colors::format_price(price),
        format!(
            "{}{}",
            if confidence > 0.0 { "\u{00b1}" } else { "" },
            colors::format_price(confidence)
        ),
        format!("{}s ago", staleness_secs),
    ]);
    table
}

pub fn settings_table(settings: &[(String, String)]) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Setting", "Value"]);
    for (key, value) in settings {
        table.add_row(vec![key.clone(), value.clone()]);
    }
    table
}

pub fn keys_table(keys: &[(String, String)]) -> Table {
    let mut table = Table::new();
    table.set_content_arrangement(ContentArrangement::Dynamic);
    table.set_header(vec!["Name", "Pubkey"]);
    for (name, pubkey) in keys {
        table.add_row(vec![name.clone(), pubkey.clone()]);
    }
    table
}

fn truncate_pubkey(pk: &str) -> String {
    if pk.len() > 12 {
        format!("{}...{}", &pk[..4], &pk[pk.len() - 4..])
    } else {
        pk.to_string()
    }
}
