import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerPoolDataTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_pool_data', {
    description:
      'Get computed pool metrics including AUM (assets under management), LP token stats, custody ratios, and utilization. Data is cached and refreshed every 15 seconds. Provide a pool_pubkey for a specific pool, or omit for all pools.',
    inputSchema: {
      pool_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().describe(
        'Specific pool pubkey. If omitted, returns all pool snapshots.',
      ),
    },
  }, async ({ pool_pubkey }) => {
    if (pool_pubkey) {
      const snapshot = await client.getPoolSnapshot(pool_pubkey)
      return { content: [{ type: 'text' as const, text: JSON.stringify(snapshot, null, 2) }] }
    }
    const data = await client.getPoolData()
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })
}
