import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { buildCustodySymbolMap, type CustodyInfo, type MarketAccount, type PoolDataResponse } from './shared/custody-map.ts'

function formatMarketsSummary(
  markets: MarketAccount[],
  custodyInfo: Map<string, CustodyInfo>,
): string {
  const lines = [
    `${markets.length} markets available:\n`,
    'Symbol     | Side  | Pool           | Max Lev | Pubkey',
    '-----------|-------|----------------|---------|----------------------------------------------',
  ]

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
      'List all available perpetual futures markets. Returns a summary table with symbol, side, pool, max leverage, and pubkey. For a trading-ready view with prices, use get_trading_overview instead.',
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
    inputSchema: { pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Solana pubkey of the market account') },
  }, async ({ pubkey }) => {
    const market = await client.getMarket(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(market, null, 2) }] }
  })
}
