import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { zBool } from '../sanitize.ts'

export function registerTriggerOrderTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('place_trigger_order', {
    description:
      'Place a take-profit (TP) or stop-loss (SL) trigger order on an existing position. Up to 5 per position. ' +
      'Use preview_tp_sl first to calculate optimal trigger prices. Returns unsigned transaction.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL", "BTC", "ETH"'),
      side: z.enum(['LONG', 'SHORT']).describe('Position side'),
      trigger_price: z.string().max(32).describe('Trigger price in UI format, e.g. "160.00"'),
      size_amount: z.string().max(32).describe('Size in target token to close when triggered, e.g. "0.5"'),
      is_stop_loss: zBool.describe('true = stop-loss, false = take-profit'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey (must own the position)'),
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
    const lines = [
      `=== Place ${params.is_stop_loss ? 'Stop-Loss' : 'Take-Profit'} Order ===`,
      `Market: ${params.market_symbol} ${params.side}`,
      `Trigger: $${params.trigger_price}`,
      `Size: ${params.size_amount} ${params.market_symbol}`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    if (res.transactionBase64) {
      lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
      lines.push(res.transactionBase64)
      lines.push(`\nNext: After signing, call get_orders with owner to see the order ID for editing/canceling.`)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('edit_trigger_order', {
    description:
      'Edit an existing TP or SL trigger order. Change trigger price, size, or type. Requires order_id (0-7) from get_orders. Returns unsigned transaction.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL", "BTC", "ETH"'),
      side: z.enum(['LONG', 'SHORT']).describe('Position side'),
      order_id: z.coerce.number().describe('Index of the trigger order to edit (0-7)'),
      trigger_price: z.string().max(32).describe('New trigger price in UI format'),
      size_amount: z.string().max(32).describe('New size in target token'),
      is_stop_loss: zBool.describe('true = stop-loss, false = take-profit'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey (must be original order owner)'),
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
    const lines = [
      `=== Edit ${params.is_stop_loss ? 'Stop-Loss' : 'Take-Profit'} Order #${params.order_id} ===`,
      `Market: ${params.market_symbol} ${params.side}`,
      `New Trigger: $${params.trigger_price}`,
      `New Size: ${params.size_amount} ${params.market_symbol}`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    if (res.transactionBase64) {
      lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
      lines.push(res.transactionBase64)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('cancel_trigger_order', {
    description:
      'Cancel a single TP or SL trigger order. Requires order_id (0-7) from get_orders. Returns unsigned transaction.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL", "BTC", "ETH"'),
      side: z.enum(['LONG', 'SHORT']).describe('Position side'),
      order_id: z.coerce.number().describe('Index of the trigger order to cancel (0-7)'),
      is_stop_loss: zBool.describe('true = stop-loss, false = take-profit'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey (must own the order)'),
    },
  }, async (params) => {
    const res = await client.cancelTriggerOrder({
      marketSymbol: params.market_symbol,
      side: params.side,
      orderId: params.order_id,
      isStopLoss: params.is_stop_loss,
      owner: params.owner,
    })
    const lines = [
      `=== Cancel ${params.is_stop_loss ? 'Stop-Loss' : 'Take-Profit'} Order #${params.order_id} ===`,
      `Market: ${params.market_symbol} ${params.side}`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    if (res.transactionBase64) {
      lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
      lines.push(res.transactionBase64)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('cancel_all_trigger_orders', {
    description:
      'Cancel ALL TP and SL trigger orders for a market+side in one transaction. Returns unsigned transaction.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL", "BTC", "ETH"'),
      side: z.enum(['LONG', 'SHORT']).describe('Position side'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey (must own the orders)'),
    },
  }, async (params) => {
    const res = await client.cancelAllTriggerOrders({
      marketSymbol: params.market_symbol,
      side: params.side,
      owner: params.owner,
    })
    const lines = [
      `=== Cancel All Trigger Orders ===`,
      `Market: ${params.market_symbol} ${params.side}`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    if (res.transactionBase64) {
      lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
      lines.push(res.transactionBase64)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
