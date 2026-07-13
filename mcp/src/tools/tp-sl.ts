import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'

export function registerTpSlTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('place_tp_sl', {
    description:
      'Build a transaction to place a take-profit AND/OR stop-loss bracket on a position in ONE atomic transaction ' +
      '(ER chain). At least one of take_profit / stop_loss is required. The API does NOT validate prices vs the oracle ' +
      '— LONG: TP above mark, SL below; SHORT mirrored. Requires >$10 collateral after fees.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL"'),
      side: z.enum(['LONG', 'SHORT']).describe('Side of the position'),
      size_amount: z.string().max(32).describe('Target-token size the bracket closes'),
      take_profit: z.string().max(32).optional().describe('TP trigger price (UI) — optional if stop_loss given'),
      stop_loss: z.string().max(32).optional().describe('SL trigger price (UI) — optional if take_profit given'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey'),
    },
  }, async (params) => {
    if (!params.take_profit && !params.stop_loss) {
      return { content: [{ type: 'text' as const, text: 'Provide at least one of take_profit or stop_loss.' }], isError: true }
    }
    const res = await client.placeTpSl({
      marketSymbol: params.market_symbol,
      side: params.side,
      takeProfitUi: params.take_profit,
      stopLossUi: params.stop_loss,
      sizeAmountUi: params.size_amount,
      owner: params.owner,
    })
    const parts = [params.take_profit ? `TP $${params.take_profit}` : null, params.stop_loss ? `SL $${params.stop_loss}` : null].filter(Boolean).join(' + ')
    return { content: [{ type: 'text' as const, text: `=== Place Bracket (${parts}) — ${params.side} ${params.market_symbol} ===${txFooter('place-tp-sl', res.transactionBase64)}` }] }
  })
}
