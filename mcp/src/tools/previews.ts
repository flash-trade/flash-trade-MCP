import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

const pubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
const side = z.enum(['LONG', 'SHORT'])

export function registerPreviewTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('preview_limit_order_fees', {
    description: 'Estimate entry price, fee, liquidation price, and hourly borrow rate for a prospective limit order (read-only, no transaction).',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      input_amount: z.string().max(32).describe('Collateral amount (UI)'),
      output_amount: z.string().max(32).describe('Position size (UI)'),
      side: side.describe('Trade direction'),
      limit_price: z.string().max(32).optional().describe('Limit price (omit = quote at live price)'),
    },
  }, async (params) => {
    const res = await client.previewLimitOrderFees({
      marketSymbol: params.market_symbol,
      inputAmountUi: params.input_amount,
      outputAmountUi: params.output_amount,
      side: params.side,
      limitPrice: params.limit_price,
    })
    const lines = [
      '=== Limit Order Fee Preview ===',
      `Entry Price: $${res.entryPriceUi}`,
      `Entry Fee: $${res.entryFeeUsdUi}`,
      `Liquidation Price: $${res.liquidationPriceUi}`,
      `Hourly Borrow Rate: ${res.borrowRateUi}%`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('preview_exit_fee', {
    description: 'Estimate the exit fee and exit price for closing part of a live position (read-only). Identify by market symbol + side.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the position'),
      close_amount_usd: z.string().max(32).describe('USD notional to close'),
      owner: pubkey.describe('Wallet pubkey (reads your live position)'),
    },
  }, async (params) => {
    const res = await client.previewExitFee({
      marketSymbol: params.market_symbol,
      side: params.side,
      closeAmountUsdUi: params.close_amount_usd,
      owner: params.owner,
    })
    const lines = [
      '=== Exit Fee Preview ===',
      `Exit Fee: $${res.exitFeeUsdUi} (${res.exitFeeAmountUi})`,
      `Exit Price: $${res.exitPriceUi}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('preview_tp_sl', {
    description:
      'Calculate TP/SL prices and projected PnL (read-only). mode=forward: trigger price → PnL. mode=reverse_pnl: ' +
      'target PnL → trigger price. mode=reverse_roi: target ROI% → trigger price. Provide owner to use your live ' +
      'position, or pass entry/size/collateral inline.',
    inputSchema: {
      mode: z.enum(['forward', 'reverse_pnl', 'reverse_roi']).describe('Calculation mode'),
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the position'),
      owner: pubkey.optional().describe('Wallet pubkey (use live position); omit to pass inline fields'),
      entry_price: z.string().max(32).optional().describe('Inline: entry price'),
      size_usd: z.string().max(32).optional().describe('Inline: position size USD'),
      collateral_usd: z.string().max(32).optional().describe('Inline: collateral USD'),
      trigger_price: z.string().max(32).optional().describe('forward: the trigger price'),
      target_pnl_usd: z.string().max(32).optional().describe('reverse_pnl: target PnL USD'),
      target_roi_percent: z.number().optional().describe('reverse_roi: target ROI %'),
    },
  }, async (params) => {
    const res = await client.previewTpSl({
      mode: params.mode,
      marketSymbol: params.market_symbol,
      side: params.side,
      owner: params.owner,
      entryPriceUi: params.entry_price,
      sizeUsdUi: params.size_usd,
      collateralUsdUi: params.collateral_usd,
      triggerPriceUi: params.trigger_price,
      targetPnlUsdUi: params.target_pnl_usd,
      targetRoiPercent: params.target_roi_percent,
    })
    const lines = ['=== TP/SL Preview ==='].concat(
      res.triggerPriceUi != null ? [`Trigger Price: $${res.triggerPriceUi}`] : [],
      res.pnlUsdUi != null ? [`PnL: $${res.pnlUsdUi} (${res.pnlPercentage}%)`] : [],
    )
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('preview_margin', {
    description: 'Preview the effect of adding or removing collateral on leverage and liquidation price (read-only). Identify by market symbol + side.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol'),
      side: side.describe('Side of the position'),
      margin_delta_usd: z.string().max(32).describe('USD to add or remove'),
      action: z.enum(['ADD', 'REMOVE']).describe('ADD or REMOVE collateral'),
      owner: pubkey.describe('Wallet pubkey'),
    },
  }, async (params) => {
    const res = await client.previewMargin({
      marketSymbol: params.market_symbol,
      side: params.side,
      marginDeltaUsdUi: params.margin_delta_usd,
      action: params.action,
      owner: params.owner,
    })
    const lines = [
      `=== Margin Preview (${params.action} $${params.margin_delta_usd}) ===`,
      `New Leverage: ${res.newLeverageUi}x`,
      `New Liquidation Price: $${res.newLiquidationPriceUi}`,
      `Max ${params.action === 'ADD' ? 'Addable' : 'Withdrawable'}: $${res.maxAmountUsdUi}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
