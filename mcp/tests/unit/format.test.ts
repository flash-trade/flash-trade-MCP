import { describe, it, expect } from 'vitest'
import { computePositionView, collateralInPositions } from '../../src/tools/shared/format.ts'
import type { PositionMetrics } from '../../src/client/types.ts'

// A LONG SOL position: entry $70, size $500, collateral $100. The indexer's
// pnlWithFeeUsdUi says -$11.43 (spread-distorted). At mark $76.29 the real
// mark-price PnL is strongly POSITIVE — this is the GOTCHAS §20 correction.
const pos: PositionMetrics = {
  marketSymbol: 'SOL', collateralSymbol: 'USDC', sideUi: 'Long',
  entryPriceUi: '70.00', sizeAmountUi: '7.14', sizeUsdUi: '500.00',
  collateralAmountUi: '100.00', collateralUsdUi: '100.00',
  pnlWithFeeUsdUi: '-11.43', pnlPercentageWithFee: '-11.43',
  pnlWithoutFeeUsdUi: '45.00', pnlPercentageWithoutFee: '45.00',
  liquidationPriceUi: '58.00', leverageUi: '5.00',
  profitUsd: '45000000', lossUsd: '0', exitFeeUsd: '250000', borrowFeeUsd: '120000',
  totalFeeUsd: '370000', leverage: '50000', marginUsd: '100000000',
  liquidationPrice: { price: '58', exponent: 0, confidence: '0', timestamp: '0' },
  exitPrice: { price: '76', exponent: 0, confidence: '0', timestamp: '0' },
}

describe('computePositionView — mark-price PnL (GOTCHAS §20)', () => {
  it('computes positive PnL from the live mark, not the distorted indexer value', () => {
    const v = computePositionView(pos, 76.29)
    // pricePnl = (76.29-70)/70 * 500 = 44.93; minus fees 0.37 = ~44.56
    expect(v.pnlUsd).toBeCloseTo(44.56, 1)
    expect(v.pnlUsd).toBeGreaterThan(0)                 // indexer said -11.43
    expect(Number(pos.pnlWithFeeUsdUi)).toBeLessThan(0) // sanity: indexer is negative
  })

  it('computes leverage = size / collateral', () => {
    expect(computePositionView(pos, 76.29).leverage).toBeCloseTo(5, 5)
  })

  it('computes an approximate liquidation price below entry for a long', () => {
    const v = computePositionView(pos, 76.29)
    expect(v.liquidationPrice).toBeCloseTo(57.12, 1)
    expect(v.liquidationPrice).toBeLessThan(v.entryPrice)
  })

  it('SHORT inverts direction (loss when mark rises)', () => {
    const short = { ...pos, sideUi: 'Short' }
    const v = computePositionView(short, 76.29)
    expect(v.side).toBe('Short')
    expect(v.pnlUsd).toBeLessThan(0)
    expect(v.liquidationPrice).toBeGreaterThan(v.entryPrice)
  })

  it('falls back to entry price when mark is unavailable (0)', () => {
    const v = computePositionView(pos, 0)
    expect(v.markPrice).toBe(70)
    expect(v.pnlUsd).toBeCloseTo(-0.37, 2) // only fees
  })

  it('collateralInPositions sums collateral', () => {
    expect(collateralInPositions([pos, pos])).toBeCloseTo(200, 5)
  })
})
