import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { buildCustodySymbolMap, type MarketAccount, type PoolDataResponse } from './shared/custody-map.ts'

export function registerMarketTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_markets', {
    description:
      'List all perpetual markets with resolved symbols, side (long/short custody), pool, and whether opening is allowed. ' +
      'For prices + pool utilization in one shot, use get_trading_overview instead.',
  }, async () => {
    const [markets, poolData] = await Promise.all([
      client.getMarkets() as Promise<MarketAccount[]>,
      client.getPoolData() as Promise<PoolDataResponse>,
    ])
    const custody = buildCustodySymbolMap(poolData)
    const rows = markets.map((m) => {
      const info = custody.get(m.account.target_custody)
      return {
        symbol: info?.symbol ?? 'UNKNOWN',
        pool: info?.pool ?? '?',
        maxLev: info?.maxLeverage ?? '?',
        side: m.account.side,
        open: m.account.permissions?.allow_open_position ?? false,
      }
    }).sort((a, b) => a.pool.localeCompare(b.pool) || a.symbol.localeCompare(b.symbol))

    const lines = ['=== Markets ===', 'Symbol     | Side  | Max Lev | Pool           | Open?']
    lines.push('-----------|-------|---------|----------------|------')
    const seen = new Set<string>()
    for (const r of rows) {
      const key = `${r.symbol}-${r.side}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(`${r.symbol.padEnd(10)} | ${r.side.padEnd(5)} | ${r.maxLev.padEnd(7)} | ${r.pool.padEnd(14)} | ${r.open ? 'yes' : 'NO'}`)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('get_market', {
    description: 'Get the raw Anchor-decoded account for one market by pubkey (debugging / deep dives).',
    inputSchema: {
      pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Market account pubkey'),
    },
  }, async ({ pubkey }) => {
    const m = await client.getMarket(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(m, null, 2) }] }
  })
}
