import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

function formatPrice(price: string, exponent: string): string {
  return (Number(price) * Math.pow(10, Number(exponent))).toFixed(2)
}

export function registerPriceTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_prices', {
    description:
      'Get current oracle prices for all traded assets on Flash Trade. Prices come from Pyth Lazer (200ms updates). Returns symbol-to-price mapping. NOTE: Prices are only available on mainnet — devnet returns stale/zero values.',
  }, async () => {
    const prices = await client.getPrices()
    const lines = ['Symbol    Price (USD)']
    for (const [symbol, data] of Object.entries(prices)) {
      lines.push(`${symbol.padEnd(10)}$${formatPrice(data.price, data.exponent)}`)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('get_price', {
    description:
      'Get the current oracle price for a specific asset symbol (e.g., "SOL", "BTC", "ETH"). Case-insensitive. Returns price in USD with timestamp.',
    inputSchema: { symbol: z.string().describe('Asset symbol, e.g. "SOL", "BTC", "ETH"') },
  }, async ({ symbol }) => {
    const data = await client.getPrice(symbol)
    const usd = formatPrice(data.price, data.exponent)
    return {
      content: [{
        type: 'text' as const,
        text: `${symbol.toUpperCase()}: $${usd}\nRaw: ${data.price} (exp: ${data.exponent})\nTimestamp: ${data.timestamp}`,
      }],
    }
  })
}
