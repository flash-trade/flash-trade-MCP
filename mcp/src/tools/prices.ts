import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerPriceTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_prices', {
    description: 'Get all current oracle prices for the active pool (Pyth Lazer), keyed by symbol, with market session.',
  }, async () => {
    const prices = await client.getPrices()
    const entries = Object.entries(prices).sort(([a], [b]) => a.localeCompare(b))
    if (entries.length === 0) return { content: [{ type: 'text' as const, text: 'No prices returned.' }] }
    const lines = ['=== Oracle Prices ===', 'Symbol     | Price          | Session']
    lines.push('-----------|----------------|----------')
    for (const [sym, p] of entries) {
      const px = Number.isFinite(p.priceUi) ? `$${p.priceUi < 1 ? p.priceUi.toPrecision(4) : p.priceUi.toFixed(2)}` : '?'
      lines.push(`${sym.padEnd(10)} | ${px.padEnd(14)} | ${p.marketSession}`)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('get_price', {
    description: 'Get the live oracle price for one symbol (e.g. "SOL"). Returns price, market session, and timestamp.',
    inputSchema: {
      symbol: z.string().max(16).describe('Market symbol, e.g. "SOL", "BTC", "ETH"'),
    },
  }, async ({ symbol }) => {
    const p = await client.getPrice(symbol)
    const px = Number.isFinite(p.priceUi) ? `$${p.priceUi}` : '?'
    const lines = [
      `=== ${symbol.toUpperCase()} Price ===`,
      `Price: ${px}`,
      `Session: ${p.marketSession}`,
      `Timestamp: ${new Date(Math.floor(p.timestampUs / 1000)).toISOString()}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
