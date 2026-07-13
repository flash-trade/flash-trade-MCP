import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { buildCustodySymbolMap, formatCompactUsd, formatPriceUsd, type MarketAccount, type PoolDataResponse } from './shared/custody-map.ts'
import { sanitizeError } from '../sanitize.ts'

export function registerTradingOverviewTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_trading_overview', {
    description:
      'Trading-ready market snapshot — recommended first call when planning new trades. All markets with live oracle ' +
      'prices, max leverage, and pool utilization in one shot (replaces get_markets + get_prices + get_pool_data).',
  }, async () => {
    const [marketsResult, pricesResult, poolResult] = await Promise.allSettled([
      client.getMarkets() as Promise<MarketAccount[]>,
      client.getPrices(),
      client.getPoolData() as Promise<PoolDataResponse>,
    ])

    const markets = marketsResult.status === 'fulfilled' ? marketsResult.value : null
    const prices = pricesResult.status === 'fulfilled' ? pricesResult.value : null
    const poolData = poolResult.status === 'fulfilled' ? poolResult.value : null

    const lines: string[] = ['=== Trading Overview ===\n']
    const warnings: string[] = []
    if (!markets) warnings.push(`Markets unavailable: ${sanitizeError((marketsResult as PromiseRejectedResult).reason)}`)
    if (!prices) warnings.push(`Prices unavailable: ${sanitizeError((pricesResult as PromiseRejectedResult).reason)}`)
    if (!poolData) warnings.push(`Pool data unavailable: ${sanitizeError((poolResult as PromiseRejectedResult).reason)}`)

    if (markets) {
      const custody = poolData ? buildCustodySymbolMap(poolData) : new Map()
      lines.push('── Markets ──')
      lines.push('Symbol     | Price          | Side  | Max Lev | Pool')
      lines.push('-----------|----------------|-------|---------|---------------')
      const enriched = markets.map((m) => {
        const info = custody.get(m.account.target_custody)
        return {
          symbol: info?.symbol ?? 'UNKNOWN',
          pool: info?.pool ?? '?',
          maxLeverage: info?.maxLeverage ?? '?',
          side: m.account.side,
          open: m.account.permissions?.allow_open_position ?? false,
        }
      }).sort((a, b) => a.pool.localeCompare(b.pool) || a.symbol.localeCompare(b.symbol) || a.side.localeCompare(b.side))
      const seen = new Set<string>()
      for (const m of enriched) {
        const key = `${m.symbol}-${m.side}`
        if (seen.has(key)) continue
        seen.add(key)
        let priceStr = '?'
        if (prices) {
          const p = prices[m.symbol]
          if (p) priceStr = `$${formatPriceUsd(p)}`
        }
        const status = m.open ? '' : ' [CLOSED]'
        lines.push(`${m.symbol.padEnd(10)} | ${priceStr.padEnd(14)} | ${m.side.padEnd(5)} | ${m.maxLeverage.padEnd(7)} | ${m.pool}${status}`)
      }
    }

    if (poolData) {
      lines.push('\n── Pool Utilization ──')
      lines.push('Pool           | AUM            | LP Price  | Stable%')
      lines.push('---------------|----------------|-----------|--------')
      for (const p of poolData.pools ?? []) {
        const name = (p.poolName ?? 'Unknown').padEnd(14)
        const aum = formatCompactUsd(p.lpStats?.totalPoolValueUsd).padEnd(14)
        const lp = `$${p.lpStats?.lpPrice ?? '?'}`.padEnd(9)
        const stable = `${p.lpStats?.stableCoinPercentage ?? '?'}%`
        lines.push(`${name} | ${aum} | ${lp} | ${stable}`)
      }
    }

    if (warnings.length > 0) {
      lines.push('\n── Warnings ──')
      for (const w of warnings) lines.push(`  ${w}`)
    }
    lines.push('\nUse open_position to trade (omit owner for a free quote). Use get_account_summary to check a wallet.')
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
