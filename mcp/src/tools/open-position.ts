import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { zBool } from '../sanitize.ts'
import type { OpenPositionResponse } from '../client/types.ts'

function formatOpenPreview(req: { outputTokenSymbol: string; tradeType: string; inputTokenSymbol: string; inputAmountUi: string }, res: OpenPositionResponse): string {
  const lines = [
    '=== Open Position Preview ===',
    `Market: ${req.outputTokenSymbol}/USD ${req.tradeType}`,
    `Entry Price: $${res.newEntryPrice}`,
    `Position Size: $${res.youRecieveUsdUi} (${res.outputAmountUi} ${req.outputTokenSymbol})`,
    `Collateral: $${res.youPayUsdUi} ${req.inputTokenSymbol}`,
    `Leverage: ${res.newLeverage}x`,
    `Liquidation Price: $${res.newLiquidationPrice}`,
    `Entry Fee: $${res.entryFee} (${res.openPositionFeePercent}%)`,
    `Hourly Borrow Rate: ${res.marginFeePercentage}%`,
    `Available Liquidity: $${res.availableLiquidity}`,
  ]
  if (res.oldEntryPrice) {
    lines.push(`\nExisting Position — Old Entry: $${res.oldEntryPrice}, Old Leverage: ${res.oldLeverage}x`)
  }
  if (res.takeProfitQuote) {
    const tp = res.takeProfitQuote
    lines.push(`\nTake Profit → PnL: $${tp.profitUsdUi} (+${tp.pnlPercentage}%), Exit: $${tp.exitPriceUi}`)
  }
  if (res.stopLossQuote) {
    const sl = res.stopLossQuote
    lines.push(`Stop Loss → PnL: -$${sl.lossUsdUi} (-${sl.pnlPercentage}%), Exit: $${sl.exitPriceUi}`)
  }
  if (res.err) {
    lines.push(`\nWARNING: ${res.err}`)
  }
  if (res.transactionBase64) {
    lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
    lines.push(res.transactionBase64)
  } else {
    lines.push(`\nNo transaction built (provide owner wallet pubkey to build transaction)`)
  }
  return lines.join('\n')
}

export function registerOpenPositionTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('open_position', {
    description:
      'Build a transaction to open a new perpetual position on Flash Trade. Returns a preview (entry price, fees, leverage, liquidation price) AND an unsigned transaction. The transaction must be signed by the user\'s wallet and submitted to Solana separately. IMPORTANT: Always present the preview to the user before they sign. This tool does NOT execute the trade. Supports both MARKET and LIMIT orders, with optional take-profit and stop-loss. COLLATERAL WARNING: Limit orders, take-profit, and stop-loss require >$10 collateral AFTER entry fees. A $10 position will have fees deducted, dropping collateral below $10 and preventing TP/SL/limit orders. Use at least $11-12 input_amount when planning to set TP/SL.',
    inputSchema: {
      input_token_symbol: z.string().max(16).describe('Token to pay with: "USDC", "SOL", etc.'),
      output_token_symbol: z.string().max(16).describe('Market to trade: "SOL", "BTC", "ETH", etc.'),
      input_amount: z.string().max(32).describe('Amount of input token, e.g. "100.0"'),
      leverage: z.string().max(8).describe('Leverage multiplier, e.g. "5.0"'),
      trade_type: z.enum(['LONG', 'SHORT']).describe('Trade direction'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey (required to build the transaction)'),
      order_type: z.enum(['MARKET', 'LIMIT']).optional().describe('Default: MARKET'),
      limit_price: z.string().max(32).optional().describe('Required for LIMIT orders, UI format price'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5" (0.5%)'),
      take_profit: z.string().max(32).optional().describe('TP trigger price in UI format'),
      stop_loss: z.string().max(32).optional().describe('SL trigger price in UI format'),
      degen_mode: zBool.optional().describe('Enable degen mode (higher leverage limits)'),
    },
  }, async (params) => {
    const res = await client.openPosition({
      inputTokenSymbol: params.input_token_symbol,
      outputTokenSymbol: params.output_token_symbol,
      inputAmountUi: params.input_amount,
      leverage: parseFloat(params.leverage),
      tradeType: params.trade_type,
      owner: params.owner,
      orderType: params.order_type,
      limitPrice: params.limit_price,
      slippagePercentage: params.slippage_percentage,
      takeProfit: params.take_profit,
      stopLoss: params.stop_loss,
      degenMode: params.degen_mode,
    })
    let text = formatOpenPreview({
      outputTokenSymbol: params.output_token_symbol,
      tradeType: params.trade_type,
      inputTokenSymbol: params.input_token_symbol,
      inputAmountUi: params.input_amount,
    }, res)
    if ((params.take_profit || params.stop_loss)) {
      const collateral = parseFloat(res.youPayUsdUi || '0')
      const fee = parseFloat(res.entryFee || '0')
      if (collateral - fee < 10) {
        text += '\n\nWARNING: Collateral after fees is below $10. Take-profit and stop-loss orders require >$10 collateral and will FAIL on-chain. Use at least $11-12 input_amount.'
      }
    }
    return { content: [{ type: 'text' as const, text }] }
  })
}
