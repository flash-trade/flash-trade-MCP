import { z } from 'zod'
import { zPubkey, zSide } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'
import { estimateLiqPrice, fmtPrice, num } from './shared/format.ts'

export function registerReversePositionTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('reverse_position', {
    description:
      'Build a transaction to flip a position LONG↔SHORT atomically (ER chain). Identify the current position by ' +
      'market symbol + side; the new position opens on the opposite side. NOTE: close proceeds take a fixed 2% haircut ' +
      'before sizing the new side — newCollateralUsd in the response is post-haircut.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL"'),
      side: zSide.describe('CURRENT side (the new position will be the opposite)'),
      leverage: z.string().max(8).describe('Leverage for the NEW side, e.g. "5.0"'),
      owner: zPubkey.describe('Wallet pubkey'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5"'),
    },
  }, async (params) => {
    const res = await client.reversePosition({
      marketSymbol: params.market_symbol,
      side: params.side,
      leverage: parseFloat(params.leverage),
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
    })
    const lines = [
      `=== Reverse ${params.side} ${params.market_symbol} → ${res.newSide} ===`,
      `Close proceeds: $${res.closeReceiveUsd} | Close fees: $${res.closeFees} | Settled PnL: $${res.closeSettledPnl}`,
      `New ${res.newSide}: $${res.newSizeUsd} (${res.newSizeAmountUi}) @ $${res.newEntryPrice}, ${res.newLeverage}x`,
      `New collateral (post-2% haircut): $${res.newCollateralUsd} | Open fee: $${res.openEntryFee}`,
      `New liquidation (est.): ${fmtPrice(estimateLiqPrice(res.newSide === 'Long', num(res.newEntryPrice), num(res.newSizeUsd), num(res.newCollateralUsd)))}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') + txFooter('reverse-position', res.transactionBase64) }] }
  })
}
