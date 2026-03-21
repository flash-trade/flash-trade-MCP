import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

interface MarketAccount {
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

interface PoolDataResponse {
  pools: Array<{
    poolName: string
    poolAddress?: string
    custodyStats: Array<{
      symbol: string
      custodyAccount: string
      maxLeverage: string
    }>
  }>
}

function buildCustodySymbolMap(poolData: PoolDataResponse): Map<string, { symbol: string; maxLeverage: string; pool: string }> {
  const map = new Map<string, { symbol: string; maxLeverage: string; pool: string }>()
  for (const pool of poolData.pools) {
    for (const c of pool.custodyStats) {
      map.set(c.custodyAccount, {
        symbol: c.symbol,
        maxLeverage: c.maxLeverage,
        pool: pool.poolName,
      })
    }
  }
  return map
}

function formatMarketsSummary(
  markets: MarketAccount[],
  custodyInfo: Map<string, { symbol: string; maxLeverage: string; pool: string }>,
): string {
  const lines = [
    `${markets.length} markets available:\n`,
    'Symbol     | Side  | Pool           | Max Lev | Pubkey',
    '-----------|-------|----------------|---------|----------------------------------------------',
  ]

  // Sort by pool then symbol
  const enriched = markets.map((m) => {
    const info = custodyInfo.get(m.account.target_custody)
    return {
      symbol: info?.symbol ?? 'UNKNOWN',
      pool: info?.pool ?? '?',
      maxLeverage: info?.maxLeverage ?? '?',
      side: m.account.side,
      pubkey: m.pubkey,
      open: m.account.permissions.allow_open_position,
    }
  }).sort((a, b) => a.pool.localeCompare(b.pool) || a.symbol.localeCompare(b.symbol) || a.side.localeCompare(b.side))

  for (const m of enriched) {
    const status = m.open ? '' : ' [CLOSED]'
    lines.push(
      `${m.symbol.padEnd(10)} | ${m.side.padEnd(5)} | ${m.pool.padEnd(14)} | ${m.maxLeverage.padEnd(7)} | ${m.pubkey}${status}`,
    )
  }

  lines.push(`\nUse get_market with a pubkey for full details. Use get_prices for current oracle prices.`)
  return lines.join('\n')
}

export function registerMarketTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_markets', {
    description:
      'List all available perpetual futures markets on Flash Trade. Returns a compact summary table with symbol, side (Long/Short), pool, max leverage, and market pubkey. For full details on a specific market, use get_market with the pubkey.',
  }, async () => {
    const [markets, poolData] = await Promise.all([
      client.getMarkets() as Promise<MarketAccount[]>,
      client.getPoolData() as unknown as Promise<PoolDataResponse>,
    ])
    const custodyInfo = buildCustodySymbolMap(poolData)
    const text = formatMarketsSummary(markets, custodyInfo)
    return { content: [{ type: 'text' as const, text }] }
  })

  server.registerTool('get_market', {
    description:
      'Get detailed information about a specific market by its on-chain account pubkey. Returns full market configuration including permissions and collective position data.',
    inputSchema: { pubkey: z.string().describe('Solana pubkey of the market account') },
  }, async ({ pubkey }) => {
    const market = await client.getMarket(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(market, null, 2) }] }
  })
}
