import { z } from 'zod'
import { zPubkey } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerPoolTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_pools', {
    description: 'List raw Anchor-decoded pool accounts. For AUM / utilization / LP price, use get_pool_data instead.',
  }, async () => {
    const pools = await client.getPools()
    return { content: [{ type: 'text' as const, text: JSON.stringify(pools, null, 2) }] }
  })

  server.registerTool('get_pool', {
    description: 'Get the raw Anchor-decoded account for one pool by pubkey.',
    inputSchema: {
      pubkey: zPubkey.describe('Pool account pubkey'),
    },
  }, async ({ pubkey }) => {
    const pool = await client.getPool(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(pool, null, 2) }] }
  })
}
