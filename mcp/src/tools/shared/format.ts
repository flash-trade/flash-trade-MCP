// ─────────────────────────────────────────────────────────────────────────────
// format.ts — derived-value math + snapshot formatting shared across tools.
// THE HARD PART: the indexer's PnL/leverage/liq degenerate near liquidation
// because it values exits through custody.tradeSpread. Every perps UI (and this
// server) instead computes PnL from the LIVE MARK price. This module owns those
// formulas (GOTCHAS §20) so tools never surface the raw indexer number.
// ─────────────────────────────────────────────────────────────────────────────

import type { PositionMetrics } from '../../client/types.ts'

const num = (s: string | number | null | undefined): number => {
  const n = typeof s === 'number' ? s : parseFloat(s ?? '')
  return Number.isFinite(n) ? n : 0
}

/** Mark-price view of a position — what a trader actually sees, not the
 *  spread-distorted indexer value. All USD outputs are numbers (dollars). */
export interface PositionView {
  marketSymbol: string
  side: 'Long' | 'Short'
  entryPrice: number
  markPrice: number
  sizeUsd: number
  collateralUsd: number
  /** size / collateral. */
  leverage: number
  /** pricePnl − (exitFee + borrowFee). Signed dollars. */
  pnlUsd: number
  /** pnl / collateral × 100. Signed percent. */
  pnlPct: number
  /** entry × (1 ∓ collateral/size × 0.92). Approximate. */
  liquidationPrice: number
}

/**
 * Compute the mark-price view of a position (GOTCHAS §20).
 *   pricePnl = (mark − entry) / entry × size × dir     (dir = +1 long, −1 short)
 *   pnl      = pricePnl − (exitFeeUsd + borrowFeeUsd)/1e6
 *   pct      = pnl / collateral × 100
 *   leverage = size / collateral
 *   liq     ≈ entry × (1 ∓ collateral/size × 0.92)
 * The raw ...Usd fields on PositionMetrics are native 6-decimal USD strings.
 */
/** Estimate liquidation price from position inputs. Single source of the liq
 *  formula so pre-trade previews and the post-trade account view never diverge
 *  (and neither surfaces the spread-distorted builder value — GOTCHAS §20).
 *  liq ≈ entry × (1 ∓ collateral/size × 0.92). Approximate. */
export function estimateLiqPrice(sideLong: boolean, entryPrice: number, sizeUsd: number, collateralUsd: number): number {
  const dir = sideLong ? 1 : -1
  return entryPrice > 0 && sizeUsd > 0 ? entryPrice * (1 - dir * (collateralUsd / sizeUsd) * 0.92) : 0
}

export function computePositionView(pm: PositionMetrics, markPriceUi: number): PositionView {
  // Case-insensitive so a lowercase sideUi can't flip a short's PnL sign.
  const side = pm.sideUi?.toLowerCase() === 'short' ? 'Short' : 'Long'
  const dir = side === 'Long' ? 1 : -1
  const entry = num(pm.entryPriceUi)
  const size = num(pm.sizeUsdUi)
  const collateral = num(pm.collateralUsdUi)
  const mark = markPriceUi > 0 ? markPriceUi : entry

  const pricePnl = entry > 0 ? ((mark - entry) / entry) * size * dir : 0
  const feeUsd = (num(pm.exitFeeUsd) + num(pm.borrowFeeUsd)) / 1e6
  const pnlUsd = pricePnl - feeUsd
  const pnlPct = collateral > 0 ? (pnlUsd / collateral) * 100 : 0
  const leverage = collateral > 0 ? size / collateral : 0
  const liq = estimateLiqPrice(side === 'Long', entry, size, collateral)

  return {
    marketSymbol: pm.marketSymbol,
    side,
    entryPrice: entry,
    markPrice: mark,
    sizeUsd: size,
    collateralUsd: collateral,
    leverage,
    pnlUsd,
    pnlPct,
    liquidationPrice: liq,
  }
}

/** Sum of collateral currently deployed across positions (dollars). This is
 *  collateral-in-positions from the snapshot — NOT the free deposit-ledger
 *  balance, which is a separate ER account (see V2-ALIGNMENT.md §4). */
export function collateralInPositions(positions: PositionMetrics[]): number {
  return positions.reduce((sum, p) => sum + num(p.collateralUsdUi), 0)
}

const fmtUsd = (n: number, dp = 2): string => {
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  return `${sign}$${a.toFixed(dp)}`
}

const fmtPrice = (n: number): string => {
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toPrecision(4)}`
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}

/** Signed dollars with an explicit +/- for PnL columns. */
const fmtSignedUsd = (n: number): string => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`

/** One-line rendering of a mark-price position view. */
export function renderPositionView(v: PositionView): string {
  return (
    `  ${v.side} ${v.marketSymbol}: ${fmtUsd(v.sizeUsd)} @ ${fmtPrice(v.entryPrice)} ` +
    `(${v.leverage.toFixed(2)}x) | mark ${fmtPrice(v.markPrice)} | ` +
    `PnL ${fmtSignedUsd(v.pnlUsd)} (${v.pnlPct >= 0 ? '+' : ''}${v.pnlPct.toFixed(2)}%) | ` +
    `liq ~${fmtPrice(v.liquidationPrice)} | collateral ${fmtUsd(v.collateralUsd)}`
  )
}

export { fmtUsd, fmtPrice, fmtSignedUsd, num }
