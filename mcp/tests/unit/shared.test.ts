import { describe, it, expect } from 'vitest'
import { formatPriceUsd, buildCustodySymbolMap, type PoolDataResponse } from '../../src/tools/shared/custody-map.ts'
import { zBool } from '../../src/sanitize.ts'

describe('formatPriceUsd', () => {
  it('formats normal price correctly', () => {
    expect(formatPriceUsd({ price: '14852000000', exponent: '-8', confidence: '0', timestamp: '' }))
      .toBe('148.52')
  })

  it('formats BTC-scale price', () => {
    expect(formatPriceUsd({ price: '6700000000000', exponent: '-8', confidence: '0', timestamp: '' }))
      .toBe('67000.00')
  })

  it('returns ? for NaN price', () => {
    expect(formatPriceUsd({ price: '', exponent: '-8', confidence: '0', timestamp: '' }))
      .toBe('?')
  })

  it('returns ? for NaN exponent', () => {
    expect(formatPriceUsd({ price: '14852000000', exponent: 'bad', confidence: '0', timestamp: '' }))
      .toBe('?')
  })

  it('returns ? for undefined-like strings', () => {
    expect(formatPriceUsd({ price: 'undefined', exponent: '-8', confidence: '0', timestamp: '' }))
      .toBe('?')
  })
})

describe('buildCustodySymbolMap', () => {
  it('maps custodyStats from pool-data', () => {
    const poolData: PoolDataResponse = {
      pools: [{
        poolName: 'Crypto.1',
        custodyStats: [
          { symbol: 'SOL', custodyAccount: 'cust1', maxLeverage: '100.00' },
          { symbol: 'USDC', custodyAccount: 'cust2', maxLeverage: '1.00' },
        ],
      }],
    }
    const map = buildCustodySymbolMap(poolData)
    expect(map.get('cust1')).toEqual({ symbol: 'SOL', maxLeverage: '100.00', pool: 'Crypto.1' })
    expect(map.get('cust2')).toEqual({ symbol: 'USDC', maxLeverage: '1.00', pool: 'Crypto.1' })
  })

  it('includes virtual custody fallbacks', () => {
    const poolData: PoolDataResponse = { pools: [{ poolName: 'Empty', custodyStats: [] }] }
    const map = buildCustodySymbolMap(poolData)
    // BNB is in VIRTUAL_CUSTODY_MAP
    expect(map.get('6bthDsp8pcGBGKVKCKZjV5JfuSUNRo62RG4hQHj1u4CK')?.symbol).toBe('BNB')
  })

  it('pool-data takes precedence over virtual map', () => {
    const poolData: PoolDataResponse = {
      pools: [{
        poolName: 'Override',
        custodyStats: [
          { symbol: 'OVERRIDDEN_BNB', custodyAccount: '6bthDsp8pcGBGKVKCKZjV5JfuSUNRo62RG4hQHj1u4CK', maxLeverage: '99.00' },
        ],
      }],
    }
    const map = buildCustodySymbolMap(poolData)
    expect(map.get('6bthDsp8pcGBGKVKCKZjV5JfuSUNRo62RG4hQHj1u4CK')?.symbol).toBe('OVERRIDDEN_BNB')
  })

  it('handles empty pool data', () => {
    const poolData: PoolDataResponse = { pools: [] }
    const map = buildCustodySymbolMap(poolData)
    // Should still have virtual entries
    expect(map.size).toBeGreaterThan(0)
  })
})

describe('zBool', () => {
  it('parses string "true" as true', () => {
    expect(zBool.parse('true')).toBe(true)
  })

  it('parses string "false" as false', () => {
    expect(zBool.parse('false')).toBe(false)
  })

  it('passes through boolean true', () => {
    expect(zBool.parse(true)).toBe(true)
  })

  it('passes through boolean false', () => {
    expect(zBool.parse(false)).toBe(false)
  })

  it('treats non-"true" strings as false (by design)', () => {
    // Any string that isn't exactly "true" becomes false via `v === 'true'`
    expect(zBool.parse('yes')).toBe(false)
    expect(zBool.parse('TRUE')).toBe(false)
    expect(zBool.parse('1')).toBe(false)
    expect(zBool.parse('')).toBe(false)
  })

  it('rejects non-string non-boolean values', () => {
    expect(() => zBool.parse(1)).toThrow()
    expect(() => zBool.parse(null)).toThrow()
    expect(() => zBool.parse(undefined)).toThrow()
  })
})
