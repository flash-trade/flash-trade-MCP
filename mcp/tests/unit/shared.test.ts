import { describe, it, expect } from 'vitest'
import { formatPriceUsd, formatCompactUsd, buildCustodySymbolMap, type PoolDataResponse } from '../../src/tools/shared/custody-map.ts'
import type { PriceInfo } from '../../src/client/types.ts'
import { zBool } from '../../src/sanitize.ts'

const price = (priceUi: number): PriceInfo => ({ price: 0, exponent: 0, confidence: 0, priceUi, timestampUs: 0, marketSession: 'regular' })

describe('formatPriceUsd (V2 PriceInfo)', () => {
  it('formats a normal price', () => {
    expect(formatPriceUsd(price(148.52))).toBe('148.52')
  })
  it('formats a BTC-scale price', () => {
    expect(formatPriceUsd(price(67000))).toBe('67000.00')
  })
  it('returns ? for a non-finite price', () => {
    expect(formatPriceUsd(price(NaN))).toBe('?')
  })
  it('formats zero', () => {
    expect(formatPriceUsd(price(0))).toBe('0.00')
  })
  it('uses adaptive precision for sub-cent tokens', () => {
    const r = formatPriceUsd(price(0.00000611))
    expect(r).not.toBe('0.00')
    expect(r).toContain('0.000006110')
  })
})

describe('formatCompactUsd', () => {
  it('formats millions', () => { expect(formatCompactUsd('5235353.43')).toBe('$5.24M') })
  it('formats thousands', () => { expect(formatCompactUsd('54472.66')).toBe('$54.5K') })
  it('formats small values', () => { expect(formatCompactUsd('123.45')).toBe('$123.45') })
  it('handles undefined', () => { expect(formatCompactUsd(undefined)).toBe('$?') })
  it('handles NaN', () => { expect(formatCompactUsd('bad')).toBe('$bad') })
})

describe('buildCustodySymbolMap', () => {
  it('maps custodyStats from pool-data', () => {
    const poolData: PoolDataResponse = {
      pools: [{ poolName: 'Crypto.1', custodyStats: [
        { symbol: 'SOL', custodyAccount: 'cust1', maxLeverage: '100.00' },
        { symbol: 'USDC', custodyAccount: 'cust2', maxLeverage: '1.00' },
      ] }],
    }
    const map = buildCustodySymbolMap(poolData)
    expect(map.get('cust1')).toEqual({ symbol: 'SOL', maxLeverage: '100.00', pool: 'Crypto.1' })
  })

  it('maps every custody from multiple pools (virtual/equity included, no hardcoding)', () => {
    const map = buildCustodySymbolMap({ pools: [
      { poolName: 'Virtual.1', custodyStats: [{ symbol: 'XAU', custodyAccount: 'v1', maxLeverage: '120.00' }] },
      { poolName: 'Equity.1', custodyStats: [{ symbol: 'NVDA', custodyAccount: 'e1', maxLeverage: '12.00' }] },
    ] })
    expect(map.get('v1')).toEqual({ symbol: 'XAU', maxLeverage: '120.00', pool: 'Virtual.1' })
    expect(map.get('e1')?.symbol).toBe('NVDA')
  })

  it('is dynamic-only: empty pool data yields an empty map (no static fallback)', () => {
    expect(buildCustodySymbolMap({ pools: [] }).size).toBe(0)
    expect(buildCustodySymbolMap({ pools: [{ poolName: 'Empty', custodyStats: [] }] }).size).toBe(0)
  })
})

describe('zBool', () => {
  it('parses "true"/"false" strings', () => {
    expect(zBool.parse('true')).toBe(true)
    expect(zBool.parse('false')).toBe(false)
  })
  it('passes through booleans', () => {
    expect(zBool.parse(true)).toBe(true)
    expect(zBool.parse(false)).toBe(false)
  })
  it('treats non-"true" strings as false by design', () => {
    expect(zBool.parse('TRUE')).toBe(false)
    expect(zBool.parse('1')).toBe(false)
  })
  it('rejects non-string non-boolean values', () => {
    expect(() => zBool.parse(1)).toThrow()
    expect(() => zBool.parse(null)).toThrow()
  })
})
