import { z } from 'zod'
import { zPubkey, zSide } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { zBool } from '../sanitize.ts'
import { txFooter } from './shared/tx.ts'

const pubkey = zPubkey
const side = zSide

export function registerTriggerOrderTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('place_trigger_order', {
    description:
      'Build a transaction to place ONE trigger order (take-profit or stop-loss) on an existing position (ER chain). ' +
      'Up to 5 triggers per side (slots 0–4). The API does NOT validate the trigger price vs the oracle — LONG: TP ' +
      'above mark, SL below; SHORT mirrored — a wrong side fails on-chain as InvalidLimitPrice (6057). Requires >$10 ' +
      'collateral after fees.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL"'),
      side: side.describe('Side of the position'),
      trigger_price: z.string().max(32).describe('Trigger price in UI units'),
      size_amount: z.string().max(32).describe('Target-token size to close when it fires'),
      is_stop_loss: zBool.describe('true = stop-loss, false = take-profit'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.placeTriggerOrder({
      marketSymbol: params.market_symbol,
      side: params.side,
      triggerPriceUi: params.trigger_price,
      sizeAmountUi: params.size_amount,
      isStopLoss: params.is_stop_loss,
      owner: params.owner,
    })
    const kind = params.is_stop_loss ? 'Stop-Loss' : 'Take-Profit'
    return { content: [{ type: 'text' as const, text: `=== Place ${kind} — ${params.side} ${params.market_symbol} @ $${params.trigger_price} ===${txFooter('place-trigger-order', res.transactionBase64)}` }] }
  })

  server.registerTool('edit_trigger_order', {
    description:
      'Build a transaction to edit a trigger slot (ER chain). BOTH trigger_price AND size_amount are required — there ' +
      'is no "keep existing" for triggers (unlike edit_limit_order). Identify the slot by order_id (0–4).',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the position'),
      order_id: z.number().int().min(0).max(4).describe('Trigger slot 0–4'),
      trigger_price: z.string().max(32).describe('New trigger price (REQUIRED)'),
      size_amount: z.string().max(32).describe('New size (REQUIRED)'),
      is_stop_loss: zBool.describe('true = stop-loss, false = take-profit'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.editTriggerOrder({
      marketSymbol: params.market_symbol,
      side: params.side,
      orderId: params.order_id,
      triggerPriceUi: params.trigger_price,
      sizeAmountUi: params.size_amount,
      isStopLoss: params.is_stop_loss,
      owner: params.owner,
    })
    return { content: [{ type: 'text' as const, text: `=== Edit Trigger #${params.order_id} — ${params.side} ${params.market_symbol} ===${txFooter('edit-trigger-order', res.transactionBase64)}` }] }
  })

  server.registerTool('cancel_trigger_order', {
    description:
      'Build a transaction to cancel one trigger slot (ER chain). order_id 0–4 cancels that slot; order_id 255 cancels ' +
      'ALL triggers for the market+side (the sentinel). For a clearer all-cancel, use cancel_all_trigger_orders.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the position'),
      order_id: z.number().int().min(0).max(255).describe('Slot 0–4, or 255 = cancel all'),
      is_stop_loss: zBool.describe('true = stop-loss, false = take-profit (ignored when order_id=255)'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.cancelTriggerOrder({
      marketSymbol: params.market_symbol,
      side: params.side,
      orderId: params.order_id,
      isStopLoss: params.is_stop_loss,
      owner: params.owner,
    })
    const label = params.order_id === 255 ? 'ALL triggers' : `trigger #${params.order_id}`
    return { content: [{ type: 'text' as const, text: `=== Cancel ${label} — ${params.side} ${params.market_symbol} ===${txFooter('cancel-trigger-order', res.transactionBase64)}` }] }
  })

  server.registerTool('cancel_all_trigger_orders', {
    description: 'Build a transaction to cancel ALL trigger orders (TP + SL) for a market + side (ER chain).',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the position'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.cancelAllTriggerOrders({
      marketSymbol: params.market_symbol,
      side: params.side,
      owner: params.owner,
    })
    return { content: [{ type: 'text' as const, text: `=== Cancel All Triggers — ${params.side} ${params.market_symbol} ===${txFooter('cancel-all-trigger-orders', res.transactionBase64)}` }] }
  })
}
