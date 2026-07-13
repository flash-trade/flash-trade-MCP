import { z } from 'zod'
import { zPubkey } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerCustodyTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_custodies', {
    description: 'List raw Anchor-decoded custody accounts (per-token holdings, fee/spread/borrow params live here).',
  }, async () => {
    const custodies = await client.getCustodies()
    return { content: [{ type: 'text' as const, text: JSON.stringify(custodies, null, 2) }] }
  })

  server.registerTool('get_custody', {
    description: 'Get the raw Anchor-decoded account for one custody by pubkey.',
    inputSchema: {
      pubkey: zPubkey.describe('Custody account pubkey'),
    },
  }, async ({ pubkey }) => {
    const custody = await client.getCustody(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(custody, null, 2) }] }
  })
}
