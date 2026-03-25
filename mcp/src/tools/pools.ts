import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerPoolTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_pools', {
    description:
      'List all liquidity pools on Flash Trade. Pools hold the collateral that backs perpetual positions. Returns pool addresses and configuration.',
  }, async () => {
    const pools = await client.getPools()
    return { content: [{ type: 'text' as const, text: JSON.stringify(pools, null, 2) }] }
  })

  server.registerTool('get_pool', {
    description: 'Get detailed information about a specific pool by its on-chain account pubkey.',
    inputSchema: { pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Solana pubkey of the pool account') },
  }, async ({ pubkey }) => {
    const pool = await client.getPool(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(pool, null, 2) }] }
  })
}
