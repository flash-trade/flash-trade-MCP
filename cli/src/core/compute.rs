// ─────────────────────────────────────────────────────────────────────────────
// compute.rs — mark-price derived values (GOTCHAS §20). The indexer's PnL/
// leverage/liq degenerate near liquidation because it values exits through
// tradeSpread; every perps UI (and this CLI) computes PnL from the LIVE MARK
// price instead. This module owns those formulas so commands never surface the
// raw indexer number.
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub struct PositionView {
    pub side_long: bool,
    pub entry_price: f64,
    pub mark_price: f64,
    pub size_usd: f64,
    pub collateral_usd: f64,
    pub leverage: f64,
    pub pnl_usd: f64,
    pub pnl_pct: f64,
    pub liquidation_price: f64,
}

/// Compute a position's mark-price view.
///   pricePnl = (mark − entry)/entry × size × dir     (dir = +1 long, −1 short)
///   pnl      = pricePnl − (exitFeeUsd + borrowFeeUsd)/1e6
///   pct      = pnl / collateral × 100
///   leverage = size / collateral
///   liq     ≈ entry × (1 ∓ collateral/size × 0.92)
/// `exit_fee_native` / `borrow_fee_native` are raw 6-decimal USD (as the API returns).
pub fn position_view(
    side_long: bool,
    entry_price: f64,
    mark_price: f64,
    size_usd: f64,
    collateral_usd: f64,
    exit_fee_native: f64,
    borrow_fee_native: f64,
) -> PositionView {
    let dir = if side_long { 1.0 } else { -1.0 };
    let mark = if mark_price > 0.0 { mark_price } else { entry_price };
    let price_pnl = if entry_price > 0.0 {
        ((mark - entry_price) / entry_price) * size_usd * dir
    } else {
        0.0
    };
    let fee_usd = (exit_fee_native + borrow_fee_native) / 1e6;
    let pnl_usd = price_pnl - fee_usd;
    let pnl_pct = if collateral_usd > 0.0 { pnl_usd / collateral_usd * 100.0 } else { 0.0 };
    let leverage = if collateral_usd > 0.0 { size_usd / collateral_usd } else { 0.0 };
    let liquidation_price = estimate_liq(side_long, entry_price, size_usd, collateral_usd);
    PositionView {
        side_long,
        entry_price,
        mark_price: mark,
        size_usd,
        collateral_usd,
        leverage,
        pnl_usd,
        pnl_pct,
        liquidation_price,
    }
}

/// Estimate liquidation price from position inputs. Single source of the liq
/// formula so pre-trade previews and the post-trade account view never diverge
/// (and neither surfaces the spread-distorted builder value — GOTCHAS §20).
/// liq ≈ entry × (1 ∓ collateral/size × 0.92). dir = +1 long, −1 short.
pub fn estimate_liq(side_long: bool, entry_price: f64, size_usd: f64, collateral_usd: f64) -> f64 {
    let dir = if side_long { 1.0 } else { -1.0 };
    if entry_price > 0.0 && size_usd > 0.0 {
        entry_price * (1.0 - dir * (collateral_usd / size_usd) * 0.92)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_position_uses_mark_not_indexer() {
        // entry 70, size 500, collateral 100, mark 76.29 → PnL ≈ +44.56
        let v = position_view(true, 70.0, 76.29, 500.0, 100.0, 250_000.0, 120_000.0);
        assert!((v.pnl_usd - 44.56).abs() < 0.1, "pnl was {}", v.pnl_usd);
        assert!(v.pnl_usd > 0.0);
        assert!((v.leverage - 5.0).abs() < 1e-6);
        assert!(v.liquidation_price < v.entry_price);
    }

    #[test]
    fn short_inverts_direction() {
        let v = position_view(false, 70.0, 76.29, 500.0, 100.0, 250_000.0, 120_000.0);
        assert!(v.pnl_usd < 0.0);
        assert!(v.liquidation_price > v.entry_price);
    }

    #[test]
    fn falls_back_to_entry_when_mark_zero() {
        let v = position_view(true, 70.0, 0.0, 500.0, 100.0, 0.0, 0.0);
        assert_eq!(v.mark_price, 70.0);
        assert!(v.pnl_usd.abs() < 1e-9);
    }
}
