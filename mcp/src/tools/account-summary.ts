import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { formatPriceUsd } from './shared/custody-map.ts'
import { sanitizeError } from '../sanitize.ts'

export function registerAccountSummaryTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_account_summary', {
    description:
      'Get a complete wallet overview: all open positions (with PnL), all pending orders (limit/TP/SL), and current prices for held markets. ' +
      'Recommended first call when managing a specific wallet — replaces calling get_positions + get_orders + get_prices separately.',
    inputSchema: {
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey'),
    },
  }, async ({ owner }) => {
    const [posResult, ordResult, priceResult] = await Promise.allSettled([
      client.getOwnerPositions(owner),
      client.getOwnerOrders(owner),
      client.getPrices(),
    ])

    const positions = posResult.status === 'fulfilled' ? posResult.value : null
    const orders = ordResult.status === 'fulfilled' ? ordResult.value : null
    const prices = priceResult.status === 'fulfilled' ? priceResult.value : null

    const lines: string[] = [`=== Account Summary for ${owner} ===\n`]
    const warnings: string[] = []

    if (!positions) warnings.push(`Positions unavailable: ${sanitizeError((posResult as PromiseRejectedResult).reason)}`)
    if (!orders) warnings.push(`Orders unavailable: ${sanitizeError((ordResult as PromiseRejectedResult).reason)}`)
    if (!prices) warnings.push(`Prices unavailable: ${sanitizeError((priceResult as PromiseRejectedResult).reason)}`)

    // Positions
    if (!positions) {
      lines.push('Positions: unavailable\n')
    } else if (positions.length === 0) {
      lines.push('Positions: None\n')
    } else {
      lines.push(`── ${positions.length} Position(s) ──`)
      for (const p of positions) {
        const pnl = p.pnlWithFeeUsdUi ? ` | PnL: $${p.pnlWithFeeUsdUi} (${p.pnlPercentageWithFee}%)` : ''
        lines.push(`  ${p.sideUi} ${p.marketSymbol}: $${p.sizeUsdUi} @ $${p.entryPriceUi} (${p.leverageUi}x)${pnl}`)
        lines.push(`    Key: ${p.key} | Liq: $${p.liquidationPriceUi}`)
      }
      lines.push('')
    }

    // Orders
    if (!orders) {
      lines.push('Orders: unavailable\n')
    } else if (orders.length === 0) {
      lines.push('Orders: None\n')
    } else {
      lines.push(`── Orders ──`)
      for (const o of orders) {
        for (const lo of o.limitOrders ?? []) {
          lines.push(`  LIMIT ${lo.sideUi} ${lo.symbol}: $${lo.sizeUsdUi} @ $${lo.entryPriceUi} (${lo.leverageUi}x)`)
        }
        for (const tp of o.takeProfitOrders ?? []) {
          lines.push(`  TP ${tp.sideUi} ${tp.symbol}: $${tp.sizeUsdUi} @ $${tp.triggerPriceUi}`)
        }
        for (const sl of o.stopLossOrders ?? []) {
          lines.push(`  SL ${sl.sideUi} ${sl.symbol}: $${sl.sizeUsdUi} @ $${sl.triggerPriceUi}`)
        }
      }
      lines.push('')
    }

    // Prices for position markets
    if (positions && prices) {
      const marketSymbols = [...new Set(positions.map(p => p.marketSymbol).filter((s): s is string => !!s))]
      if (marketSymbols.length > 0) {
        lines.push('── Current Prices ──')
        for (const sym of marketSymbols) {
          const priceData = prices[sym]
          if (priceData) {
            const usd = formatPriceUsd(priceData)
            lines.push(`  ${sym}: ${usd === '?' ? 'price unavailable' : `$${usd}`}`)
          }
        }
        lines.push('')
      }
    }

    if (warnings.length > 0) {
      lines.push('── Warnings ──')
      for (const w of warnings) lines.push(`  ${w}`)
    }

    lines.push('Note: Data is cached ~15 seconds. Recently closed positions may still appear briefly.')
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
