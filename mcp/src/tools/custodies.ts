import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerCustodyTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_custodies', {
    description:
      'List all custody accounts. Custodies hold the actual tokens for each asset in a pool (e.g., the USDC custody, the SOL custody). Returns custody pubkeys, token info, and utilization metrics.',
  }, async () => {
    const custodies = await client.getCustodies()
    return { content: [{ type: 'text' as const, text: JSON.stringify(custodies, null, 2) }] }
  })

  server.registerTool('get_custody', {
    description:
      'Get detailed custody information for a specific custody account. Includes utilization, fees, and limits.',
    inputSchema: { pubkey: z.string().describe('Solana pubkey of the custody account') },
  }, async ({ pubkey }) => {
    const custody = await client.getCustody(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(custody, null, 2) }] }
  })
}
