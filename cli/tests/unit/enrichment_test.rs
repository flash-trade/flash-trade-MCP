use flash_sdk::pool_config::Side;

// Replicate the enrichment functions locally for testing (avoid binary dep)
fn calculate_simple_pnl(size_usd: f64, entry_price: f64, mark_price: f64, side: &Side) -> f64 {
    if entry_price <= 0.0 {
        return 0.0;
    }
    let ratio = (mark_price - entry_price) / entry_price;
    match side {
        Side::Long => size_usd * ratio,
        Side::Short => size_usd * (-ratio),
    }
}

fn calculate_simple_leverage(size_usd: f64, collateral_usd: f64) -> f64 {
    if collateral_usd <= 0.0 {
        return 0.0;
    }
    size_usd / collateral_usd
}

fn calculate_approx_liquidation_price(entry_price: f64, leverage: f64, side: &Side) -> f64 {
    if leverage <= 0.0 || entry_price <= 0.0 {
        return 0.0;
    }
    let maintenance = 0.01;
    let close_fee = 0.001;
    let margin = 1.0 / leverage;
    match side {
        Side::Long => entry_price * (1.0 - margin + maintenance + close_fee),
        Side::Short => entry_price * (1.0 + margin - maintenance - close_fee),
    }
}

fn native_usd_to_ui(native: u64) -> f64 {
    native as f64 / 1_000_000.0
}

#[test]
fn test_pnl_long_profit() {
    let pnl = calculate_simple_pnl(1000.0, 100.0, 110.0, &Side::Long);
    assert!(
        (pnl - 100.0).abs() < 0.01,
        "Long +10%: PnL should be +$100, got {pnl}"
    );
}

#[test]
fn test_pnl_long_loss() {
    let pnl = calculate_simple_pnl(1000.0, 100.0, 90.0, &Side::Long);
    assert!(
        (pnl - (-100.0)).abs() < 0.01,
        "Long -10%: PnL should be -$100, got {pnl}"
    );
}

#[test]
fn test_pnl_short_profit() {
    let pnl = calculate_simple_pnl(1000.0, 100.0, 90.0, &Side::Short);
    assert!(
        (pnl - 100.0).abs() < 0.01,
        "Short -10%: PnL should be +$100, got {pnl}"
    );
}

#[test]
fn test_pnl_short_loss() {
    let pnl = calculate_simple_pnl(1000.0, 100.0, 110.0, &Side::Short);
    assert!(
        (pnl - (-100.0)).abs() < 0.01,
        "Short +10%: PnL should be -$100, got {pnl}"
    );
}

#[test]
fn test_pnl_zero_entry_price() {
    let pnl = calculate_simple_pnl(1000.0, 0.0, 100.0, &Side::Long);
    assert_eq!(pnl, 0.0, "Zero entry price should return 0 PnL");
}

#[test]
fn test_leverage_calculation() {
    let lev = calculate_simple_leverage(1000.0, 200.0);
    assert!((lev - 5.0).abs() < 0.01, "1000/200 should be 5x, got {lev}");
}

#[test]
fn test_leverage_zero_collateral() {
    let lev = calculate_simple_leverage(1000.0, 0.0);
    assert_eq!(lev, 0.0, "Zero collateral should return 0 leverage");
}

#[test]
fn test_liquidation_price_long() {
    let liq = calculate_approx_liquidation_price(100.0, 5.0, &Side::Long);
    // For 5x long: entry * (1 - 0.2 + 0.01 + 0.001) = 100 * 0.811 = 81.1
    assert!(
        liq > 79.0 && liq < 83.0,
        "5x long liq should be ~81, got {liq}"
    );
}

#[test]
fn test_liquidation_price_short() {
    let liq = calculate_approx_liquidation_price(100.0, 5.0, &Side::Short);
    // For 5x short: entry * (1 + 0.2 - 0.01 - 0.001) = 100 * 1.189 = 118.9
    assert!(
        liq > 117.0 && liq < 121.0,
        "5x short liq should be ~119, got {liq}"
    );
}

#[test]
fn test_native_usd_to_ui() {
    assert!(
        (native_usd_to_ui(1_000_000) - 1.0).abs() < 0.001,
        "1M native = $1"
    );
    assert!(
        (native_usd_to_ui(100_000_000) - 100.0).abs() < 0.001,
        "100M native = $100"
    );
    assert!((native_usd_to_ui(0) - 0.0).abs() < 0.001, "0 native = $0");
}
