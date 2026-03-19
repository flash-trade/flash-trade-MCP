import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerPreviewTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('preview_limit_order_fees', {
    description:
      'Preview the entry price, fees, liquidation price, and borrow rate for a limit order BEFORE placing it. Use this to evaluate a trade before committing. No transaction is built.',
    inputSchema: {
      market_symbol: z.string().describe('Market symbol, e.g. "SOL", "BTC", "ETH"'),
      input_amount: z.string().describe('Collateral amount in UI format'),
      output_amount: z.string().describe('Position size in target token'),
      side: z.enum(['LONG', 'SHORT']).describe('Trade direction'),
      limit_price: z.string().optional().describe('Limit price; uses live price if omitted'),
      trading_fee_discount_percent: z.number().optional().describe('Fee discount from FAF staking (0-100)'),
    },
  }, async (params) => {
    const res = await client.previewLimitOrderFees({
      marketSymbol: params.market_symbol,
      inputAmountUi: params.input_amount,
      outputAmountUi: params.output_amount,
      side: params.side,
      limitPrice: params.limit_price,
      tradingFeeDiscountPercent: params.trading_fee_discount_percent,
    })
    const lines = [
      '=== Limit Order Fee Preview ===',
      `Entry Price: $${res.entryPriceUi}`,
      `Entry Fee: $${res.entryFeeUsdUi}`,
      `Liquidation Price: $${res.liquidationPriceUi}`,
      `Hourly Borrow Rate: ${res.borrowRateUi}%`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('preview_exit_fee', {
    description:
      'Preview the exit fee and exit price for closing a specific amount of a position. Use this to estimate close costs before calling close_position. No transaction is built.',
    inputSchema: {
      position_key: z.string().describe('Position account pubkey'),
      close_amount_usd: z.string().describe('USD amount to close'),
    },
  }, async (params) => {
    const res = await client.previewExitFee({
      positionKey: params.position_key,
      closeAmountUsdUi: params.close_amount_usd,
    })
    const lines = [
      '=== Exit Fee Preview ===',
      `Exit Price: $${res.exitPriceUi}`,
      `Exit Fee: $${res.exitFeeUsdUi} (${res.exitFeeAmountUi} tokens)`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('preview_tp_sl', {
    description:
      'Calculate take-profit or stop-loss prices and projected PnL. Three modes: "forward" (trigger price → PnL), "reverse_pnl" (target PnL → trigger price), "reverse_roi" (target ROI% → trigger price). Works for existing positions (by pubkey) or hypothetical orders (provide market_symbol, entry_price, size, collateral, side).',
    inputSchema: {
      mode: z.enum(['forward', 'reverse_pnl', 'reverse_roi']).describe('Calculation mode'),
      position_key: z.string().optional().describe('Position pubkey (for existing positions)'),
      market_symbol: z.string().optional().describe('Market symbol (for hypothetical orders)'),
      entry_price: z.string().optional().describe('Entry price (for hypothetical orders)'),
      size_usd: z.string().optional().describe('Position size USD (for hypothetical orders)'),
      collateral_usd: z.string().optional().describe('Collateral USD (for hypothetical orders)'),
      side: z.enum(['LONG', 'SHORT']).optional().describe('Side (for hypothetical orders)'),
      trigger_price: z.string().optional().describe('Trigger price (required for "forward" mode)'),
      target_pnl_usd: z.string().optional().describe('Target PnL USD (required for "reverse_pnl" mode)'),
      target_roi_percent: z.number().optional().describe('Target ROI% (required for "reverse_roi" mode)'),
    },
  }, async (params) => {
    const res = await client.previewTpSl({
      mode: params.mode,
      positionKey: params.position_key,
      marketSymbol: params.market_symbol,
      entryPriceUi: params.entry_price,
      sizeUsdUi: params.size_usd,
      collateralUsdUi: params.collateral_usd,
      side: params.side,
      triggerPriceUi: params.trigger_price,
      targetPnlUsdUi: params.target_pnl_usd,
      targetRoiPercent: params.target_roi_percent,
    })
    const lines = [`=== TP/SL Preview (${params.mode}) ===`]
    if (res.pnlUsdUi) lines.push(`Projected PnL: $${res.pnlUsdUi}`)
    if (res.pnlPercentage) lines.push(`PnL %: ${res.pnlPercentage}%`)
    if (res.triggerPriceUi) lines.push(`Trigger Price: $${res.triggerPriceUi}`)
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('preview_margin', {
    description:
      'Preview the effect of adding or removing margin (collateral) on a position. Shows new leverage, new liquidation price, and max adjustable amount. Use this before calling add_collateral or remove_collateral. No transaction is built.',
    inputSchema: {
      position_key: z.string().describe('Position account pubkey'),
      margin_delta_usd: z.string().describe('Amount in USD to add or remove'),
      action: z.enum(['ADD', 'REMOVE']).describe('ADD to reduce leverage, REMOVE to increase leverage'),
    },
  }, async (params) => {
    const res = await client.previewMargin({
      positionKey: params.position_key,
      marginDeltaUsdUi: params.margin_delta_usd,
      action: params.action,
    })
    const lines = [
      `=== Margin Preview (${params.action}) ===`,
      `New Leverage: ${res.newLeverageUi}x`,
      `New Liq Price: $${res.newLiquidationPriceUi}`,
      `Max Amount: $${res.maxAmountUsdUi}`,
    ]
    if (res.err) lines.push(`\nWARNING: ${res.err}`)
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
