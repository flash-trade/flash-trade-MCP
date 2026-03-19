import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerResources(server: McpServer, client: FlashApiClient) {
  // Global accounts snapshot (static resource — no parameters)
  server.registerResource('flash-accounts', 'flash://accounts', {
    description:
      'Snapshot of all Flash Trade on-chain accounts: pools, custodies, markets, and global config. For real-time streaming, use the Flash Trade API SSE endpoint directly.',
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

  // Owner positions (template resource — parameterized by owner)
  server.registerResource(
    'flash-positions',
    new ResourceTemplate('flash://positions/{owner}', {
      list: undefined,
      complete: {
        owner: () => [],
      },
    }),
    {
      description:
        'Enriched position snapshot for a wallet owner. Returns positions with computed PnL, leverage, and liquidation price. Read this resource to get the current state; for continuous updates, poll periodically.',
      mimeType: 'application/json',
    },
    async (uri, { owner }) => {
      const ownerStr = typeof owner === 'string' ? owner : String(owner)
      const positions = await client.getOwnerPositions(ownerStr)
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(positions, null, 2),
        }],
      }
    },
  )

  // Owner orders (template resource — parameterized by owner)
  server.registerResource(
    'flash-orders',
    new ResourceTemplate('flash://orders/{owner}', {
      list: undefined,
      complete: {
        owner: () => [],
      },
    }),
    {
      description:
        'Enriched order snapshot for a wallet owner. Returns limit orders, take-profit, and stop-loss orders with computed trigger prices and sizes.',
      mimeType: 'application/json',
    },
    async (uri, { owner }) => {
      const ownerStr = typeof owner === 'string' ? owner : String(owner)
      const orders = await client.getOwnerOrders(ownerStr)
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(orders, null, 2),
        }],
      }
    },
  )
}
