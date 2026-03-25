import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { AddCollateralResponse, RemoveCollateralResponse } from '../client/types.ts'

function formatAddCollateral(res: AddCollateralResponse): string {
  const lines = [
    '=== Add Collateral Preview ===',
    `Collateral: $${res.existingCollateralUsd} → $${res.newCollateralUsd}`,
    `Leverage: ${res.existingLeverage}x → ${res.newLeverage}x`,
    `Liq Price: $${res.existingLiquidationPrice} → $${res.newLiquidationPrice}`,
    `Deposit Value: $${res.depositUsdValue}`,
    `Max Addable: $${res.maxAddableUsd}`,
  ]
  if (res.err) lines.push(`\nWARNING: ${res.err}`)
  if (res.transactionBase64) {
    lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
    lines.push(res.transactionBase64)
  }
  return lines.join('\n')
}

function formatRemoveCollateral(res: RemoveCollateralResponse): string {
  const lines = [
    '=== Remove Collateral Preview ===',
    `Collateral: $${res.existingCollateralUsd} → $${res.newCollateralUsd}`,
    `Leverage: ${res.existingLeverage}x → ${res.newLeverage}x`,
    `Liq Price: $${res.existingLiquidationPrice} → $${res.newLiquidationPrice}`,
    `Receive: ${res.receiveAmountUi} ($${res.receiveAmountUsdUi})`,
    `Max Withdrawable: $${res.maxWithdrawableUsd}`,
  ]
  if (res.err) lines.push(`\nWARNING: ${res.err}`)
  if (res.transactionBase64) {
    lines.push(`\nTransaction (base64, unsigned — sign with wallet):`)
    lines.push(res.transactionBase64)
  }
  return lines.join('\n')
}

export function registerCollateralTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('add_collateral', {
    description:
      'Build a transaction to add collateral to an existing position. This reduces leverage and moves the liquidation price further from the current price (safer). Returns a preview and unsigned transaction.',
    inputSchema: {
      position_key: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Position account pubkey'),
      deposit_amount: z.string().max(32).describe('Amount to deposit in UI format'),
      deposit_token_symbol: z.string().max(16).describe('Token to deposit: "USDC", "SOL", etc.'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5" (0.5%)'),
    },
  }, async (params) => {
    const res = await client.addCollateral({
      positionKey: params.position_key,
      depositAmountUi: params.deposit_amount,
      depositTokenSymbol: params.deposit_token_symbol,
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
    })
    return { content: [{ type: 'text' as const, text: formatAddCollateral(res) }] }
  })

  server.registerTool('remove_collateral', {
    description:
      'Build a transaction to remove collateral from an existing position. This increases leverage and moves the liquidation price closer (riskier). WARNING: Removing too much collateral can lead to liquidation. Returns a preview and unsigned transaction.',
    inputSchema: {
      position_key: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Position account pubkey'),
      withdraw_amount_usd: z.string().max(32).describe('USD amount to withdraw'),
      withdraw_token_symbol: z.string().max(16).describe('Token to receive: "USDC", "SOL", etc.'),
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey'),
      slippage_percentage: z.string().max(8).optional().describe('Default: "0.5" (0.5%)'),
    },
  }, async (params) => {
    const res = await client.removeCollateral({
      positionKey: params.position_key,
      withdrawAmountUsdUi: params.withdraw_amount_usd,
      withdrawTokenSymbol: params.withdraw_token_symbol,
      owner: params.owner,
      slippagePercentage: params.slippage_percentage,
    })
    return { content: [{ type: 'text' as const, text: formatRemoveCollateral(res) }] }
  })
}
