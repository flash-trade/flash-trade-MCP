import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { SETUP_STEPS } from './owner.ts'

export function registerBasketTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_basket', {
    description:
      'Get the raw Anchor-decoded basket account by its PDA (deep dive). The basket holds all of a wallet\'s ' +
      'positions and orders. Get the basket PDA from get_owner (basketPubkey); if get_owner shows no basket, ' +
      'the account is not set up yet. ' + SETUP_STEPS,
    inputSchema: {
      basket_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Basket PDA (from get_owner → basketPubkey)'),
    },
  }, async ({ basket_pubkey }) => {
    const basket = await client.getBasket(basket_pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(basket, null, 2) }] }
  })
}
