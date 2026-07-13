import { z } from 'zod'
import { zPubkey, zSide } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'

const pubkey = zPubkey

export function registerCollateralTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('add_collateral', {
    description:
      'Build a transaction to add collateral to a position (lowers leverage + liquidation risk). ER chain. ' +
      'Identify the position by market symbol + side.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL"'),
      side: zSide.describe('Side of the position'),
      deposit_amount: z.string().max(32).describe('Amount to add in deposit-token UI units'),
      deposit_token_symbol: z.string().max(16).describe('Deposit token symbol, e.g. "USDC"'),
      owner: pubkey.describe('Wallet pubkey'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5"'),
    },
  }, async (params) => {
    const res = await client.addCollateral({
      marketSymbol: params.market_symbol,
      side: params.side,
      depositAmountUi: params.deposit_amount,
      depositTokenSymbol: params.deposit_token_symbol,
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
    })
    const lines = [
      `=== Add Collateral — ${params.side} ${params.market_symbol} ===`,
      `Collateral: $${res.existingCollateralUsd} → $${res.newCollateralUsd}`,
      `Leverage: ${res.existingLeverage}x → ${res.newLeverage}x`,
      `Liquidation (est.): $${res.existingLiquidationPrice} → $${res.newLiquidationPrice}`,
      `Deposit value: $${res.depositUsdValue} (max addable: $${res.maxAddableUsd})`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') + txFooter('add-collateral', res.transactionBase64) }] }
  })

  server.registerTool('remove_collateral', {
    description:
      'Build a transaction to remove collateral from a position (raises leverage; bounded by maxWithdrawableUsd). ' +
      'ER chain. Identify the position by market symbol + side.',
    inputSchema: {
      market_symbol: z.string().max(16).describe('Market symbol, e.g. "SOL"'),
      side: zSide.describe('Side of the position'),
      withdraw_amount_usd: z.string().max(32).describe('USD to remove (> 0 and < current collateral)'),
      withdraw_token_symbol: z.string().max(16).describe('Token to receive, e.g. "USDC"'),
      owner: pubkey.describe('Wallet pubkey'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5"'),
    },
  }, async (params) => {
    const res = await client.removeCollateral({
      marketSymbol: params.market_symbol,
      side: params.side,
      withdrawAmountUsdUi: params.withdraw_amount_usd,
      withdrawTokenSymbol: params.withdraw_token_symbol,
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
    })
    const lines = [
      `=== Remove Collateral — ${params.side} ${params.market_symbol} ===`,
      `Collateral: $${res.existingCollateralUsd} → $${res.newCollateralUsd}`,
      `Leverage: ${res.existingLeverage}x → ${res.newLeverage}x`,
      `Liquidation (est.): $${res.existingLiquidationPrice} → $${res.newLiquidationPrice}`,
      `Receive: ${res.receiveAmountUi} ($${res.receiveAmountUsdUi}) | max withdrawable: $${res.maxWithdrawableUsd}`,
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') + txFooter('remove-collateral', res.transactionBase64) }] }
  })
}
