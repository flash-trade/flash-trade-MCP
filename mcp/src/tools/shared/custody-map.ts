import type { PriceData } from '../../client/types.ts'

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

/**
 * Static fallback map for virtual/synthetic custodies not exposed by pool-data.
 * These are on-chain accounts with stable addresses. Resolved via Pyth oracle
 * cross-referencing and mint address prefixes.
 */
export const VIRTUAL_CUSTODY_MAP: Record<string, { symbol: string; pool: string; maxLeverage: string }> = {
  // Crypto.1 — virtual
  '6bthDsp8pcGBGKVKCKZjV5JfuSUNRo62RG4hQHj1u4CK': { symbol: 'BNB', pool: 'Crypto.1', maxLeverage: '60.00' },
  // Governance.1 — virtual
  'A8SKWb3pwbFUtxLQhnpUTfy7CkxBpWGvTLYyJyWHCMWv': { symbol: 'PYTH', pool: 'Governance.1', maxLeverage: '60.00' },
  '5JtPiHFmkb1nv1Qvs3sryLgXmjs8p5iQexAseC2Ljjzg': { symbol: 'KMNO', pool: 'Governance.1', maxLeverage: '60.00' },
  '9GeU2eX2B8nLCJr7FKhXeR73fM2ULBwUXZqHov9iipxz': { symbol: 'MET', pool: 'Governance.1', maxLeverage: '15.00' },
  // Virtual.1 — forex
  '7WWSRZSgFmp7UDfD1KHWYJ2CqXVbpCdQ5cQfgBxjpFeL': { symbol: 'EUR', pool: 'Virtual.1', maxLeverage: '550.00' },
  'Ah1Kd146CtAexGvbVNWRMQ8aXJTJDf4AopNLQZKGfYck': { symbol: 'GBP', pool: 'Virtual.1', maxLeverage: '550.00' },
  'ERiMNq88WEByvDUKsPsvkJRnvsDrPPhbWedn59cDfvXY': { symbol: 'USDJPY', pool: 'Virtual.1', maxLeverage: '550.00' },
  '2zB3Uv3SoFGe17UiGjPGrwBRA7edH3YRwtHWQES7KkqP': { symbol: 'USDCNH', pool: 'Virtual.1', maxLeverage: '550.00' },
  // Virtual.1 — commodities
  '3j1xiP6GckKCzsTm6sni5iy6zrpZX5BWZGbKCq5buk4d': { symbol: 'XAU', pool: 'Virtual.1', maxLeverage: '120.00' },
  'GMqeFJ8LG5BcrRtVgvfQuA7giBETcY76ikC8h5hPh59h': { symbol: 'XAG', pool: 'Virtual.1', maxLeverage: '130.00' },
  '5mggznCHoC98t2xXNYPVR8cqNhRhYdhV7qGWqMoY6YSJ': { symbol: 'CRUDEOIL', pool: 'Virtual.1', maxLeverage: '7.00' },
  // Equity.1 — stocks
  'A2C8A9QMEQ1XAWjLSe7zUNRXSjDqQA4cpYzLYGvDZS1u': { symbol: 'AMZN', pool: 'Equity.1', maxLeverage: '12.00' },
  'CK6ByFWy3fMbymx55SGhWi4yEv4HebdtdbLMwfPTZDwK': { symbol: 'AAPL', pool: 'Equity.1', maxLeverage: '12.00' },
  'GDudQbq15yQuhvZ2N63qiYdQBiMipooeArcUgcwizd5b': { symbol: 'AMD', pool: 'Equity.1', maxLeverage: '12.00' },
  'HbwAAHzRwNqrZMD9WzMJBYGnKqUrDLcodD9rvaEkPYXK': { symbol: 'NVDA', pool: 'Equity.1', maxLeverage: '12.00' },
  'RQNURQjDbq2Yah2udtFTNT7TjR15vsPV3oJNnwYher8': { symbol: 'TSLA', pool: 'Equity.1', maxLeverage: '12.00' },
  // Community.3
  'ArnD1faZVVkkewX4HUSoDuht46egAtVvhDTFMJn3DkFo': { symbol: 'SAMO', pool: 'Community.3', maxLeverage: '50.00' },
}

export function formatPriceUsd(data: PriceData): string {
  const price = parseFloat(data.price)
  const exp = parseFloat(data.exponent)
  if (isNaN(price) || isNaN(exp)) return '?'
  return (price * Math.pow(10, exp)).toFixed(2)
}

export function buildCustodySymbolMap(poolData: PoolDataResponse): Map<string, CustodyInfo> {
  const map = new Map<string, CustodyInfo>()

  // Primary: pool-data custodyStats (covers non-virtual custodies)
  for (const pool of poolData.pools) {
    for (const c of pool.custodyStats) {
      map.set(c.custodyAccount, {
        symbol: c.symbol,
        maxLeverage: c.maxLeverage,
        pool: pool.poolName,
      })
    }
  }

  // Fallback: static map for virtual custodies not in pool-data
  for (const [pubkey, info] of Object.entries(VIRTUAL_CUSTODY_MAP)) {
    if (!map.has(pubkey)) {
      map.set(pubkey, info)
    }
  }

  return map
}
