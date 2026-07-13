// ─────────────────────────────────────────────────────────────────────────────
// custody-map.ts — resolve market/custody pubkeys to human symbols for the
// trading-overview and markets tables. The sole source is /pool-data
// custodyStats, which exposes EVERY custody (crypto, virtual/synthetic, equity),
// and the map is rebuilt on each call — so newly listed markets appear with no
// code change. Never hardcode a custody/symbol/leverage list here: the pool set
// is dynamic (see the "Discover markets & stay current" docs guide).
// ─────────────────────────────────────────────────────────────────────────────

import type { PriceInfo } from '../../client/types.ts'

export interface PoolDataResponse {
  pools: Array<{
    poolName: string
    poolAddress?: string
    custodyStats: Array<{
      symbol: string
      custodyAccount: string
      maxLeverage: string
    }>
    lpStats?: {
      totalPoolValueUsd?: string
      lpPrice?: string
      stableCoinPercentage?: string
    }
  }>
}

export interface MarketAccount {
  pubkey: string
  account: {
    side: string
    target_custody: string
    collateral_custody: string
    pool: string
    permissions: {
      allow_open_position: boolean
      allow_close_position: boolean
    }
  }
}

export interface CustodyInfo {
  symbol: string
  maxLeverage: string
  pool: string
}

/** Format a live price for display. V2 PriceInfo carries priceUi directly. */
export function formatPriceUsd(data: PriceInfo): string {
  const usd = typeof data?.priceUi === 'number' ? data.priceUi : NaN
  if (!Number.isFinite(usd)) return '?'
  if (usd === 0) return '0.00'
  if (usd < 0.01) return usd.toPrecision(4)
  return usd.toFixed(2)
}

export function formatCompactUsd(valueStr: string | undefined): string {
  if (!valueStr) return '$?'
  const n = parseFloat(valueStr)
  if (isNaN(n)) return `$${valueStr}`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

/** Build a custody-pubkey → {symbol, maxLeverage, pool} map straight from the
 *  live /pool-data custodyStats. Rebuilt per call; no static fallback, so the
 *  map always reflects exactly what the API currently lists. */
export function buildCustodySymbolMap(poolData: PoolDataResponse): Map<string, CustodyInfo> {
  const map = new Map<string, CustodyInfo>()
  for (const pool of poolData.pools ?? []) {
    for (const c of pool.custodyStats ?? []) {
      map.set(c.custodyAccount, { symbol: c.symbol, maxLeverage: c.maxLeverage, pool: pool.poolName })
    }
  }
  return map
}
