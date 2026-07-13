import { z } from 'zod'
import { zPubkey, zSide } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'

export function registerClosePositionTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('close_position', {
    description:
      'Build a transaction to close a position fully or partially (ER chain). Identify the position by market symbol ' +
      '+ side (not a position key). input_usd is the USD notional to close; "0" (or ≥97% of size) means a FULL close. ' +
      'Returns settlement preview + the unsigned transaction.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL"'),
      side: zSide.describe('Side of the position being closed'),
      input_usd: z.string().max(32).describe('USD notional to close; "0" = full close'),
      withdraw_token_symbol: z.string().max(16).describe('Settlement token symbol, e.g. "USDC"'),
      owner: zPubkey.describe('Wallet pubkey (required)'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5"'),
    },
  }, async (params) => {
    const res = await client.closePosition({
      marketSymbol: params.market_symbol,
      side: params.side,
      inputUsdUi: params.input_usd,
      withdrawTokenSymbol: params.withdraw_token_symbol,
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
    })
    const full = params.input_usd === '0' || res.newSize === '0'
    const lines = [
      `=== Close ${params.side} ${params.market_symbol} (${full ? 'FULL' : 'partial'}) ===`,
      `Receive: ${res.receiveTokenAmountUi} ${res.receiveTokenSymbol} ($${res.receiveTokenAmountUsdUi})`,
      `Mark: $${res.markPrice} | Entry: $${res.entryPrice}`,
      `Settled PnL: $${res.settledPnl}`,
      `Fees: $${res.fees}`,
      `Size: ${res.existingSize} → ${res.newSize} | Collateral: $${res.existingCollateral} → $${res.newCollateral}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') + txFooter('close-position', res.transactionBase64) }] }
  })
}
