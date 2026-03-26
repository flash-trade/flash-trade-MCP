import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { zBool } from '../sanitize.ts'
import type { ClosePositionResponse } from '../client/types.ts'

function formatClosePreview(res: ClosePositionResponse): string {
  const lines = [
    '=== Close Position Preview ===',
    `Mark Price: $${res.markPrice}`,
    `Entry Price: $${res.entryPrice}`,
    `Settled PnL: $${res.settledPnl}`,
    '',
    `Size: $${res.existingSize} → $${res.newSize}`,
    `Collateral: $${res.existingCollateral} → $${res.newCollateral}`,
    `Leverage: ${res.existingLeverage}x → ${res.newLeverage}x`,
    `Liq Price: $${res.existingLiquidationPrice} → $${res.newLiquidationPrice}`,
    '',
    `Receive: ${res.receiveTokenAmountUi} ${res.receiveTokenSymbol} ($${res.receiveTokenAmountUsdUi})`,
    `Fees: $${res.fees} (before discount: $${res.feesBeforeDiscount})`,
  ]
  if (res.lockAndUnsettledFeeUsd) {
    lines.push(`Lock & Unsettled Fee: $${res.lockAndUnsettledFeeUsd}`)
  }
  if (res.err) {
    lines.push(`\nWARNING: ${res.err}`)
  }
  if (res.transactionBase64) {
    lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
    lines.push(res.transactionBase64)
  }
  return lines.join('\n')
}

export function registerClosePositionTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('close_position', {
    description:
      'Build a transaction to close (fully or partially) an existing perpetual position. Returns a preview with PnL, fees, and receive amount, plus an unsigned transaction. For a full close, set input_usd to the position\'s full size. For a partial close, use a smaller amount. The transaction must be signed and submitted separately.',
    inputSchema: {
      position_key: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Position account pubkey to close'),
      input_usd: z.string().max(32).describe('USD amount to close, e.g. "500.00" for full or "250.00" for partial'),
      withdraw_token_symbol: z.string().max(16).describe('Token to receive: "USDC", "SOL", etc.'),
      keep_leverage_same: zBool.optional().describe('Keep leverage constant during partial close'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5" (0.5%)'),
    },
  }, async (params) => {
    const res = await client.closePosition({
      positionKey: params.position_key,
      inputUsdUi: params.input_usd,
      withdrawTokenSymbol: params.withdraw_token_symbol,
      keepLeverageSame: params.keep_leverage_same,
      slippagePercentage: params.slippage_percentage,
    })
    return { content: [{ type: 'text' as const, text: formatClosePreview(res) }] }
  })
}
