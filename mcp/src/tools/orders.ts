import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { EnrichedOrder } from '../client/types.ts'

function formatEnrichedOrder(o: EnrichedOrder): string {
  const lines = [`Order: ${o.key}`]
  for (const lo of o.limitOrders) {
    lines.push(`  Limit ${lo.sideUi} ${lo.symbol}: $${lo.sizeUsdUi} @ $${lo.entryPriceUi} (${lo.leverageUi}x)`)
  }
  for (const tp of o.takeProfitOrders) {
    lines.push(`  TP ${tp.sideUi} ${tp.symbol}: $${tp.sizeUsdUi} @ $${tp.triggerPriceUi}`)
  }
  for (const sl of o.stopLossOrders) {
    lines.push(`  SL ${sl.sideUi} ${sl.symbol}: $${sl.sizeUsdUi} @ $${sl.triggerPriceUi}`)
  }
  return lines.join('\n')
}

export function registerOrderTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_orders', {
    description:
      'List pending orders (limit, take-profit, stop-loss). With owner: returns enriched orders with computed trigger prices and sizes. Needed to find order_id (0-7) for edit_trigger_order or cancel_trigger_order.',
    inputSchema: {
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().describe(
        'Wallet pubkey to filter by. When provided, returns enriched orders.',
      ),
    },
  }, async ({ owner }) => {
    if (owner) {
      const orders = await client.getOwnerOrders(owner)
      if (orders.length === 0) {
        return { content: [{ type: 'text' as const, text: `No open orders for ${owner}` }] }
      }
      const text = orders.map(formatEnrichedOrder).join('\n\n')
      return { content: [{ type: 'text' as const, text: `${orders.length} order account(s) for ${owner}:\n\n${text}` }] }
    }
    const orders = await client.getOrders()
    return { content: [{ type: 'text' as const, text: JSON.stringify(orders, null, 2) }] }
  })

  server.registerTool('get_order', {
    description: 'Get a single order account by its on-chain pubkey.',
    inputSchema: { pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Order account pubkey') },
  }, async ({ pubkey }) => {
    const order = await client.getOrder(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(order, null, 2) }] }
  })
}
