import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerMarketTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_markets', {
    description:
      'List all available perpetual futures markets on Flash Trade. Returns market symbols (SOL, BTC, ETH, etc.), their account pubkeys, and configuration. Use this to discover which markets can be traded.',
  }, async () => {
    const markets = await client.getMarkets()
    return { content: [{ type: 'text' as const, text: JSON.stringify(markets, null, 2) }] }
  })

  server.registerTool('get_market', {
    description:
      'Get detailed information about a specific market by its on-chain account pubkey. Returns full market configuration including max leverage, fees, and status.',
    inputSchema: { pubkey: z.string().describe('Solana pubkey of the market account') },
  }, async ({ pubkey }) => {
    const market = await client.getMarket(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(market, null, 2) }] }
  })
}
