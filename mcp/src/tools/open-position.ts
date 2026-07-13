import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { OpenPositionResponse } from '../client/types.ts'
import { txFooter } from './shared/tx.ts'

function formatPreview(req: { outputTokenSymbol: string; tradeType: string; inputTokenSymbol: string }, res: OpenPositionResponse): string {
  const lines = [
    '=== Open Position Preview ===',
    `Market: ${req.outputTokenSymbol}/USD ${req.tradeType}`,
    `Entry Price: $${res.newEntryPrice}`,
    `Effective Size: $${res.youRecieveUsdUi} (${res.outputAmountUi} ${req.outputTokenSymbol})`,
    `Collateral: $${res.youPayUsdUi} ${req.inputTokenSymbol}`,
    `Leverage: ${res.newLeverage}x`,
    `Liquidation Price: $${res.newLiquidationPrice}`,
    `Entry Fee: $${res.entryFee} (${res.openPositionFeePercent}%)`,
    `Hourly Borrow Rate: ${res.marginFeePercentage}%`,
    `Available Liquidity: $${res.availableLiquidity}`,
  ]
  if (res.oldEntryPrice) lines.push(`Existing position — Old Entry: $${res.oldEntryPrice}, Old Leverage: ${res.oldLeverage}x`)
  if (res.takeProfitQuote) lines.push(`Take Profit → PnL: $${res.takeProfitQuote.profitUsdUi} (+${res.takeProfitQuote.pnlPercentage}%), Exit: $${res.takeProfitQuote.exitPriceUi}`)
  if (res.stopLossQuote) lines.push(`Stop Loss → PnL: -$${res.stopLossQuote.lossUsdUi} (-${res.stopLossQuote.pnlPercentage}%), Exit: $${res.stopLossQuote.exitPriceUi}`)
  if (res.passesMaxPositionSize === false) lines.push(`WARNING: exceeds max position size ($${res.maxPositionSizeUsd}).`)
  return lines.join('\n')
}

export function registerOpenPositionTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('open_position', {
    description:
      'Build a transaction to open (or increase) a perpetual position, OR get a free quote. Omit `owner` for a ' +
      'preview-only quote (no transaction is built). Include `owner` to also get the unsigned transaction (ER chain). ' +
      'Supports MARKET and LIMIT orders with optional bundled TP/SL. The effective size is reshaped by the entry ' +
      'spread — trust the returned youRecieveUsdUi / leverage, not collateral×leverage. ' +
      'Use at least $11 collateral if setting TP/SL/limit — collateral after fees must exceed $10 or they fail on-chain.',
    inputSchema: {
      input_token_symbol: z.string().max(16).describe('Collateral token symbol: "USDC", "SOL", etc.'),
      output_token_symbol: z.string().max(16).describe('Market symbol to trade: "SOL", "BTC", "ETH", etc.'),
      input_amount: z.string().max(32).describe('Collateral amount in UI units, e.g. "11.0"'),
      leverage: z.string().max(8).describe('Leverage multiplier, e.g. "5.0"'),
      trade_type: z.enum(['LONG', 'SHORT']).describe('Trade direction'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().describe('Wallet pubkey — OMIT for a free quote, include to build the transaction'),
      order_type: z.enum(['MARKET', 'LIMIT']).optional().describe('Default: MARKET'),
      limit_price: z.string().max(32).optional().describe('Required for LIMIT orders (UI price)'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5" (0.5%)'),
      take_profit: z.string().max(32).optional().describe('Bundled TP trigger price (UI)'),
      stop_loss: z.string().max(32).optional().describe('Bundled SL trigger price (UI)'),
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
    })

    let text = formatPreview({ outputTokenSymbol: params.output_token_symbol, tradeType: params.trade_type, inputTokenSymbol: params.input_token_symbol }, res)

    if (params.take_profit || params.stop_loss) {
      const collateral = parseFloat(res.youPayUsdUi || '0')
      const fee = parseFloat(res.entryFee || '0')
      if (collateral - fee < 10) {
        text += '\n\nWARNING: Collateral after fees is below $10. TP/SL/limit require >$10 collateral and will FAIL on-chain. Use at least $11–12.'
      }
    }

    if (params.owner) {
      text += txFooter('open-position', res.transactionBase64)
    } else {
      text += '\n\n(Quote only — no owner provided, so no transaction was built. Pass owner to build the transaction.)'
    }
    return { content: [{ type: 'text' as const, text }] }
  })
}
