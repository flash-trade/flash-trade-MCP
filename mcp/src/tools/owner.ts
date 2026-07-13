import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { BasketSnapshot, OrderMetrics, PositionMetrics, PriceInfo } from '../client/types.ts'
import { computePositionView, renderPositionView, collateralInPositions, fmtUsd } from './shared/format.ts'

const ownerParam = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Wallet pubkey (owner)')

/** The V2 lifecycle, for "not set up" guidance. Detect via basketPubkey == null. */
export const SETUP_STEPS =
  'Run setup in order: init_basket → init_deposit_ledger → delegate_basket → deposit_direct. ' +
  'Then trade on the Ephemeral Rollup. (The API does not enforce this order — the on-chain program does.)'

/** Render the positions section of an owner snapshot using mark-price math. */
export function renderPositions(snapshot: BasketSnapshot, prices: Record<string, PriceInfo> | null): string[] {
  const positions = Object.values(snapshot.positionMetrics ?? {}) as PositionMetrics[]
  if (positions.length === 0) return ['Positions: none']
  const lines = [`── ${positions.length} Position(s) (PnL computed from live mark price) ──`]
  for (const p of positions) {
    const mark = prices?.[p.marketSymbol]?.priceUi ?? 0
    lines.push(renderPositionView(computePositionView(p, mark)))
  }
  return lines
}

/** Render the orders section (limit / TP / SL) of an owner snapshot. */
export function renderOrders(snapshot: BasketSnapshot): string[] {
  const orders = Object.values(snapshot.orderMetrics ?? {}) as OrderMetrics[]
  const rows: string[] = []
  for (const o of orders) {
    for (const lo of o.limitOrders ?? []) {
      rows.push(`  LIMIT ${o.sideUi} ${o.marketSymbol} #${lo.orderId}: ${lo.sizeAmountUi} @ $${lo.limitPriceUi}` +
        (lo.takeProfitUi ? ` TP $${lo.takeProfitUi}` : '') + (lo.stopLossUi ? ` SL $${lo.stopLossUi}` : ''))
    }
    for (const tp of o.takeProfitOrders ?? []) {
      rows.push(`  TP ${o.sideUi} ${o.marketSymbol} #${tp.orderId}: ${tp.sizeAmountUi} @ $${tp.triggerPriceUi}`)
    }
    for (const sl of o.stopLossOrders ?? []) {
      rows.push(`  SL ${o.sideUi} ${o.marketSymbol} #${sl.orderId}: ${sl.sizeAmountUi} @ $${sl.triggerPriceUi}`)
    }
  }
  return rows.length ? [`── Orders ──`, ...rows] : ['Orders: none']
}

/** Setup-status header line + guidance when the account is not fully set up. */
export function renderSetupStatus(snapshot: BasketSnapshot): string[] {
  if (!snapshot.basketPubkey) {
    return ['Setup: NOT SET UP (no basket). ' + SETUP_STEPS]
  }
  return [`Setup: basket ${snapshot.basketPubkey}`]
}

export function registerOwnerTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_owner', {
    description:
      'THE V2 read model: everything about one wallet in a single call — setup/basket status, all open positions ' +
      '(with PnL recomputed from the live mark price, not the spread-distorted indexer value), and all resting orders. ' +
      'If the wallet is not set up yet, this reports which lifecycle step is missing.',
    inputSchema: { owner: ownerParam },
  }, async ({ owner }) => {
    const [snapshot, prices] = await Promise.all([client.getOwner(owner), client.getPrices().catch(() => null)])
    const lines = [
      `=== Owner ${owner} ===`,
      ...renderSetupStatus(snapshot),
      '',
      ...renderPositions(snapshot, prices),
      '',
      ...renderOrders(snapshot),
    ]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('get_positions', {
    description: 'List open positions for a wallet, with size, entry, leverage, and PnL computed from the live mark price. Sourced from the single owner snapshot.',
    inputSchema: { owner: ownerParam },
  }, async ({ owner }) => {
    const [snapshot, prices] = await Promise.all([client.getOwner(owner), client.getPrices().catch(() => null)])
    const positions = Object.values(snapshot.positionMetrics ?? {}) as PositionMetrics[]
    const lines = [`=== Positions for ${owner} ===`, ...renderPositions(snapshot, prices)]
    if (positions.length > 0) lines.push('', `Collateral in positions: ${fmtUsd(collateralInPositions(positions))}`)
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('get_orders', {
    description: 'List resting orders (limit, take-profit, stop-loss) for a wallet. Sourced from the single owner snapshot.',
    inputSchema: { owner: ownerParam },
  }, async ({ owner }) => {
    const snapshot = await client.getOwner(owner)
    const lines = [`=== Orders for ${owner} ===`, ...renderOrders(snapshot)]
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
