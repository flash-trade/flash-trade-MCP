// Mark-price derived values (GOTCHAS §20). The CLI must never surface the
// indexer's spread-distorted pnl/leverage — it recomputes from the live mark.

use flash_cli::core::compute::position_view;

#[test]
fn long_profit_uses_mark_price_and_subtracts_fees() {
    // entry 70, mark 76.29, size 500, collateral 100.
    // pricePnl = (76.29-70)/70 * 500 = 44.93; fees = (250000+120000)/1e6 = 0.37.
    let v = position_view(true, 70.0, 76.29, 500.0, 100.0, 250_000.0, 120_000.0);
    assert!((v.pnl_usd - 44.56).abs() < 0.1, "pnl was {}", v.pnl_usd);
    assert!((v.leverage - 5.0).abs() < 1e-9);
    assert!((v.pnl_pct - 44.56).abs() < 0.2, "pct was {}", v.pnl_pct);
    // Long liquidation sits below entry.
    assert!(v.liquidation_price < v.entry_price);
}

#[test]
fn short_inverts_pnl_and_liquidation_side() {
    let long = position_view(true, 70.0, 76.29, 500.0, 100.0, 0.0, 0.0);
    let short = position_view(false, 70.0, 76.29, 500.0, 100.0, 0.0, 0.0);
    assert!(long.pnl_usd > 0.0);
    assert!(short.pnl_usd < 0.0);
    // Short liquidation sits above entry.
    assert!(short.liquidation_price > short.entry_price);
}

#[test]
fn zero_mark_falls_back_to_entry_price() {
    let v = position_view(true, 70.0, 0.0, 500.0, 100.0, 0.0, 0.0);
    assert_eq!(v.mark_price, 70.0);
    assert!(v.pnl_usd.abs() < 1e-9);
}

#[test]
fn fees_reduce_pnl_relative_to_a_feeless_position() {
    let feeless = position_view(true, 100.0, 110.0, 1000.0, 200.0, 0.0, 0.0);
    let with_fees = position_view(true, 100.0, 110.0, 1000.0, 200.0, 500_000.0, 500_000.0);
    // 1e6 native fee total → $1.00 less pnl.
    assert!((feeless.pnl_usd - with_fees.pnl_usd - 1.0).abs() < 1e-6);
}

#[test]
fn degenerate_inputs_do_not_panic() {
    let v = position_view(true, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    assert_eq!(v.leverage, 0.0);
    assert_eq!(v.pnl_pct, 0.0);
    assert_eq!(v.liquidation_price, 0.0);
}
