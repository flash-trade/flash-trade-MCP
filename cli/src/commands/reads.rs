use crate::core::api::ApiClient;
use crate::core::compute::position_view;
use crate::core::network::Network;
use crate::output::colors::{color_pnl, color_pnl_percent, color_side, format_price, format_usd};
use anyhow::Result;
use serde_json::Value;

fn f(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(|x| x.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0)
}
fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

pub async fn health(api: &ApiClient) -> Result<()> {
    let h = api.health().await?;
    println!("Status:  {}", s(&h, "status"));
    println!("Program: {}", s(&h, "program"));
    if let Some(cfg) = h.get("config") {
        println!("Config:  env={} source={} version={}", s(cfg, "env"), s(cfg, "source"), s(cfg, "version"));
        if s(cfg, "env") == "dev" {
            println!("NOTE: env=dev — this deployment may carry test spreads (~10% on some markets).");
        }
    }
    if let Some(acc) = h.get("accounts").and_then(|a| a.as_object()) {
        println!("Accounts:");
        for (k, val) in acc {
            println!("  {k}: {val}");
        }
    }
    Ok(())
}

pub async fn tokens(api: &ApiClient, filter: Option<&str>) -> Result<()> {
    let tokens = api.tokens().await?;
    println!("{:<10} | {:<44} | Dec | Type", "Symbol", "Mint");
    println!("{}", "-".repeat(74));
    for t in tokens {
        if let Some(fsym) = filter {
            if !t.symbol.eq_ignore_ascii_case(fsym) {
                continue;
            }
        }
        let kind = if t.is_virtual { "virtual" } else if t.is_token2022 { "token2022" } else if t.is_stable { "stable" } else { "spl" };
        println!("{:<10} | {:<44} | {:>3} | {}", t.symbol, t.mint, t.decimals, kind);
    }
    println!("\nUse the Mint (not the symbol) for setup deposit and withdrawals.");
    Ok(())
}

pub async fn prices(api: &ApiClient) -> Result<()> {
    let p = api.prices().await?;
    if let Some(map) = p.as_object() {
        let mut rows: Vec<(&String, f64, &str)> = map
            .iter()
            .map(|(k, v)| (k, v.get("priceUi").and_then(|x| x.as_f64()).unwrap_or(0.0), v.get("marketSession").and_then(|x| x.as_str()).unwrap_or("")))
            .collect();
        rows.sort_by(|a, b| a.0.cmp(b.0));
        println!("{:<10} | {:<14} | Session", "Symbol", "Price");
        println!("{}", "-".repeat(40));
        for (sym, px, session) in rows {
            println!("{:<10} | {:<14} | {}", sym, format_price(px), session);
        }
    }
    Ok(())
}

pub async fn price(api: &ApiClient, symbol: &str, watch: bool) -> Result<()> {
    loop {
        let p = api.price(symbol).await?;
        let px = p.get("priceUi").and_then(|x| x.as_f64()).unwrap_or(0.0);
        println!("{}: {} ({})", symbol.to_uppercase(), format_price(px), s(&p, "marketSession"));
        if !watch {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
    Ok(())
}

pub async fn markets(api: &ApiClient) -> Result<()> {
    // Everything is in /pool-data: marketStats gives (symbol, side, open interest)
    // per market; custodyStats gives each symbol's max leverage cap.
    let pool_data = api.pool_data().await?;
    println!("{:<10} | {:<6} | {:<9} | {:<16} | Pool", "Symbol", "Side", "Max Lev", "Open Int (USD)");
    println!("{}", "-".repeat(64));
    if let Some(pools) = pool_data.get("pools").and_then(|p| p.as_array()) {
        for pool in pools {
            let pname = s(pool, "poolName");
            let mut lev: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            if let Some(cs) = pool.get("custodyStats").and_then(|c| c.as_array()) {
                for c in cs {
                    lev.insert(s(c, "symbol").to_string(), s(c, "maxLeverage").to_string());
                }
            }
            if let Some(ms) = pool.get("marketStats").and_then(|m| m.as_array()) {
                for m in ms {
                    let sym = s(m, "targetSymbol");
                    let side = match s(m, "side") {
                        "long" => "Long",
                        "short" => "Short",
                        other => other,
                    };
                    let maxlev = lev.get(sym).map(|l| format!("{l}x")).unwrap_or_else(|| "?".to_string());
                    let oi = s(m, "openInterestUsd");
                    println!("{:<10} | {:<6} | {:<9} | {:<16} | {}", sym, side, maxlev, format!("${oi}"), pname);
                }
            }
        }
    }
    Ok(())
}

pub async fn account(api: &ApiClient, _net: &Network, owner: &str) -> Result<()> {
    let snap = api.owner(owner).await?;
    println!("=== Owner {owner} ===");
    match snap.get("basketPubkey").and_then(|b| b.as_str()) {
        Some(pk) if !pk.is_empty() => println!("Setup: basket {pk}"),
        _ => {
            println!("Setup: NOT SET UP (no basket).");
            println!("Run: flash setup init-basket -> init-ledger -> delegate -> deposit (each with --submit).");
        }
    }

    // Prices for mark-price PnL.
    let prices = api.prices().await.unwrap_or(Value::Null);
    let mark_of = |sym: &str| -> f64 {
        prices.get(sym).and_then(|p| p.get("priceUi")).and_then(|x| x.as_f64()).unwrap_or(0.0)
    };

    // Positions.
    let positions = snap.get("positionMetrics").and_then(|p| p.as_object());
    match positions {
        Some(map) if !map.is_empty() => {
            println!("\n-- {} Position(s) (mark-price PnL) --", map.len());
            for pos in map.values() {
                let sym = s(pos, "marketSymbol");
                let long = s(pos, "sideUi") != "Short";
                let v = position_view(
                    long,
                    f(pos, "entryPriceUi"),
                    mark_of(sym),
                    f(pos, "sizeUsdUi"),
                    f(pos, "collateralUsdUi"),
                    f(pos, "exitFeeUsd"),
                    f(pos, "borrowFeeUsd"),
                );
                println!(
                    "  {} {}: {} @ {} ({:.2}x) | mark {} | PnL {} ({}) | liq ~{} | collateral {}",
                    color_side(if long { "long" } else { "short" }),
                    sym,
                    format_usd(v.size_usd),
                    format_price(v.entry_price),
                    v.leverage,
                    format_price(v.mark_price),
                    color_pnl(v.pnl_usd),
                    color_pnl_percent(v.pnl_pct),
                    format_price(v.liquidation_price),
                    format_usd(v.collateral_usd),
                );
            }
        }
        _ => println!("\nPositions: none"),
    }

    // Orders.
    let mut order_lines: Vec<String> = Vec::new();
    if let Some(map) = snap.get("orderMetrics").and_then(|o| o.as_object()) {
        for o in map.values() {
            let sym = s(o, "marketSymbol");
            let side = s(o, "sideUi");
            if let Some(arr) = o.get("limitOrders").and_then(|x| x.as_array()) {
                for lo in arr {
                    order_lines.push(format!("  LIMIT {side} {sym} #{}: {} @ ${}", lo.get("orderId").and_then(|x| x.as_u64()).unwrap_or(0), s(lo, "sizeAmountUi"), s(lo, "limitPriceUi")));
                }
            }
            if let Some(arr) = o.get("takeProfitOrders").and_then(|x| x.as_array()) {
                for tp in arr {
                    order_lines.push(format!("  TP {side} {sym} #{}: {} @ ${}", tp.get("orderId").and_then(|x| x.as_u64()).unwrap_or(0), s(tp, "sizeAmountUi"), s(tp, "triggerPriceUi")));
                }
            }
            if let Some(arr) = o.get("stopLossOrders").and_then(|x| x.as_array()) {
                for sl in arr {
                    order_lines.push(format!("  SL {side} {sym} #{}: {} @ ${}", sl.get("orderId").and_then(|x| x.as_u64()).unwrap_or(0), s(sl, "sizeAmountUi"), s(sl, "triggerPriceUi")));
                }
            }
        }
    }
    if order_lines.is_empty() {
        println!("Orders: none");
    } else {
        println!("\n-- Orders --");
        for line in order_lines {
            println!("{line}");
        }
    }
    Ok(())
}
