import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerResources(server: McpServer, client: FlashApiClient) {
  // Global accounts snapshot (raw pools / custodies / markets).
  server.registerResource('flash-accounts', 'flash://accounts', {
    description: 'Snapshot of Flash V2 on-chain accounts: raw pools, custodies, and markets. Poll periodically for updates.',
    mimeType: 'application/json',
  }, async () => {
    const [pools, custodies, markets] = await Promise.all([
      client.getPools(),
      client.getCustodies(),
      client.getMarkets(),
    ])
    return {
      contents: [{
        uri: 'flash://accounts',
        mimeType: 'application/json',
        text: JSON.stringify({ pools, custodies, markets }, null, 2),
      }],
    }
  })

  // Per-owner snapshot (the V2 read model — basket, positions, orders).
  server.registerResource(
    'flash-owner',
    new ResourceTemplate('flash://owner/{owner}', { list: undefined, complete: { owner: () => [] } }),
    {
      description: 'The V2 owner snapshot for a wallet: basket PDA, enriched positions and orders. basketPubkey=null means the account is not set up. Poll periodically for updates.',
      mimeType: 'application/json',
    },
    async (uri, { owner }) => {
      const ownerStr = typeof owner === 'string' ? owner : String(owner)
      const snapshot = await client.getOwner(ownerStr)
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(snapshot, null, 2) }],
      }
    },
  )
}
