import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { buildCustodySymbolMap, formatCompactUsd, formatPriceUsd, type MarketAccount, type PoolDataResponse } from './shared/custody-map.ts'
import { sanitizeError } from '../sanitize.ts'

export function registerTradingOverviewTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_trading_overview', {
    description:
      'Get a trading-ready market snapshot: all markets with current oracle prices, max leverage, and pool utilization. ' +
      'Recommended first call when planning new trades — replaces calling get_markets + get_prices + get_pool_data separately.',
  }, async () => {
    const [marketsResult, pricesResult, poolResult] = await Promise.allSettled([
      client.getMarkets() as Promise<MarketAccount[]>,
      client.getPrices(),
      client.getPoolData() as unknown as Promise<PoolDataResponse>,
    ])

    const markets = marketsResult.status === 'fulfilled' ? marketsResult.value : null
    const prices = pricesResult.status === 'fulfilled' ? pricesResult.value : null
    const poolData = poolResult.status === 'fulfilled' ? poolResult.value : null

    const lines: string[] = ['=== Trading Overview ===\n']
    const warnings: string[] = []

    if (!markets) warnings.push(`Markets unavailable: ${sanitizeError((marketsResult as PromiseRejectedResult).reason)}`)
    if (!prices) warnings.push(`Prices unavailable: ${sanitizeError((pricesResult as PromiseRejectedResult).reason)}`)
    if (!poolData) warnings.push(`Pool data unavailable: ${sanitizeError((poolResult as PromiseRejectedResult).reason)}`)

    // Markets with prices
    if (markets) {
      const custodyInfo = poolData ? buildCustodySymbolMap(poolData) : new Map()

      lines.push('── Markets ──')
      lines.push('Symbol     | Price         | Side  | Max Lev | Pool')
      lines.push('-----------|---------------|-------|---------|---------------')

      const enriched = markets.map((m) => {
        const info = custodyInfo.get(m.account.target_custody)
        return {
          symbol: info?.symbol ?? 'UNKNOWN',
          pool: info?.pool ?? '?',
          maxLeverage: info?.maxLeverage ?? '?',
          side: m.account.side,
          open: m.account.permissions.allow_open_position,
        }
      }).sort((a, b) => a.pool.localeCompare(b.pool) || a.symbol.localeCompare(b.symbol) || a.side.localeCompare(b.side))

      const seen = new Set<string>()
      for (const m of enriched) {
        const key = `${m.symbol}-${m.side}`
        if (seen.has(key)) continue
        seen.add(key)
        let priceStr = '?'
        if (prices) {
          const priceData = prices[m.symbol]
          if (priceData) priceStr = `$${formatPriceUsd(priceData)}`
        }
        const status = m.open ? '' : ' [CLOSED]'
        lines.push(
          `${m.symbol.padEnd(10)} | ${priceStr.padEnd(13)} | ${m.side.padEnd(5)} | ${m.maxLeverage.padEnd(7)} | ${m.pool}${status}`,
        )
      }
    }

    // Pool utilization
    if (poolData) {
      lines.push('\n── Pool Utilization ──')
      lines.push('Pool           | AUM            | LP Price  | Stable%')
      lines.push('---------------|----------------|-----------|--------')

      for (const p of poolData.pools) {
        const name = (p.poolName ?? 'Unknown').padEnd(14)
        const aum = formatCompactUsd(p.lpStats?.totalPoolValueUsd).padEnd(14)
        const lp = `$${p.lpStats?.lpPrice ?? '?'}`.padEnd(9)
        const stable = `${p.lpStats?.stableCoinPercentage ?? '?'}%`
        lines.push(`${name} | ${aum} | ${lp} | ${stable}`)
      }
    }

    if (warnings.length > 0) {
      lines.push(`\n── Warnings ──`)
      for (const w of warnings) lines.push(`  ${w}`)
    }

    lines.push('\nUse open_position to trade. Use get_account_summary to check existing positions.')
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
