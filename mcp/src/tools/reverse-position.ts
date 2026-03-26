import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { ReversePositionResponse } from '../client/types.ts'

function formatReversePreview(res: ReversePositionResponse): string {
  const lines = [
    '=== Reverse Position Preview ===',
    '',
    '── Close Side ──',
    `Receive: $${res.closeReceiveUsd}`,
    `Close Fees: $${res.closeFees}`,
    `Settled PnL: $${res.closeSettledPnl}`,
    '',
    '── Open Side ──',
    `New Direction: ${res.newSide}`,
    `Size: $${res.newSizeUsd} (${res.newSizeAmountUi})`,
    `Collateral: $${res.newCollateralUsd}`,
    `Leverage: ${res.newLeverage}x`,
    `Entry Price: $${res.newEntryPrice}`,
    `Liq Price: $${res.newLiquidationPrice}`,
    `Entry Fee: $${res.openEntryFee}`,
  ]
  if (res.err) lines.push(`\nWARNING: ${res.err}`)
  if (res.transactionBase64) {
    lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
    lines.push(res.transactionBase64)
  }
  return lines.join('\n')
}

export function registerReversePositionTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('reverse_position', {
    description:
      'Build a transaction to reverse a position (close current + open opposite direction). For example, close a LONG and open a SHORT with the same collateral. Returns combined close+open preview and a single unsigned transaction.',
    inputSchema: {
      position_key: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Position account pubkey to reverse'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5" (0.5%)'),
      degen_mode: z.coerce.boolean().optional().describe('Enable degen mode for the new position'),
    },
  }, async (params) => {
    const res = await client.reversePosition({
      positionKey: params.position_key,
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
      degenMode: params.degen_mode,
    })
    return { content: [{ type: 'text' as const, text: formatReversePreview(res) }] }
  })
}
