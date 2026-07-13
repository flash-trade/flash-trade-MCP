import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'

const pubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
const side = z.enum(['LONG', 'SHORT'])

export function registerLimitOrderTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('edit_limit_order', {
    description:
      'Build a transaction to edit a resting limit order (ER chain). Unlike edit_trigger_order, here OMITTING a field ' +
      '(or passing 0) means KEEP EXISTING — only the fields you provide change. Identify the order by order_id.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the order'),
      order_id: z.number().int().min(0).max(4).describe('Limit order slot 0–4'),
      limit_price: z.string().max(32).optional().describe('New limit price (omit = keep existing)'),
      size_amount: z.string().max(32).optional().describe('New size (omit = keep existing)'),
      take_profit: z.string().max(32).optional().describe('New bundled TP (omit = keep existing)'),
      stop_loss: z.string().max(32).optional().describe('New bundled SL (omit = keep existing)'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.editLimitOrder({
      marketSymbol: params.market_symbol,
      side: params.side,
      orderId: params.order_id,
      limitPriceUi: params.limit_price,
      sizeAmountUi: params.size_amount,
      takeProfitUi: params.take_profit,
      stopLossUi: params.stop_loss,
      owner: params.owner,
    })
    return { content: [{ type: 'text' as const, text: `=== Edit Limit Order #${params.order_id} — ${params.side} ${params.market_symbol} ===${txFooter('edit-limit-order', res.transactionBase64)}` }] }
  })

  server.registerTool('cancel_limit_order', {
    description: 'Build a transaction to cancel a resting limit order and free its reserved collateral (ER chain). Identify by order_id.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the order'),
      order_id: z.number().int().min(0).max(4).describe('Limit order slot 0–4'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.cancelLimitOrder({
      marketSymbol: params.market_symbol,
      side: params.side,
      orderId: params.order_id,
      owner: params.owner,
    })
    return { content: [{ type: 'text' as const, text: `=== Cancel Limit Order #${params.order_id} — ${params.side} ${params.market_symbol} ===${txFooter('cancel-limit-order', res.transactionBase64)}` }] }
  })
}
