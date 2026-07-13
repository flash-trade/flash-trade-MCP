import { z } from 'zod'
import { zPubkey } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { PositionMetrics } from '../client/types.ts'
import { collateralInPositions, fmtUsd } from './shared/format.ts'
import { renderPositions, renderOrders, renderSetupStatus } from './owner.ts'

export function registerAccountSummaryTool(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_account_summary', {
    description:
      'Complete wallet overview — recommended first call when managing a specific wallet. Combines setup status, ' +
      'open positions (PnL from live mark price), resting orders, and collateral-in-positions from the single V2 owner ' +
      'snapshot. NOTE: this shows collateral deployed in positions; the free deposit-ledger balance is a separate ER ' +
      'account (see get_tokens / the app) — this tool does not fabricate a spend balance.',
    inputSchema: {
      owner: zPubkey.describe('Wallet pubkey'),
    },
  }, async ({ owner }) => {
    const [snapshot, prices] = await Promise.all([client.getOwner(owner), client.getPrices().catch(() => null)])
    const positions = Object.values(snapshot.positionMetrics ?? {}) as PositionMetrics[]

    const lines = [
      `=== Account Summary for ${owner} ===`,
      ...renderSetupStatus(snapshot),
      '',
      ...renderPositions(snapshot, prices),
      '',
      ...renderOrders(snapshot),
    ]
    if (positions.length > 0) {
      lines.push('', `Collateral in positions: ${fmtUsd(collateralInPositions(positions))}`)
    }
    if (!prices) lines.push('', 'WARNING: prices unavailable — position PnL fell back to entry price.')
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
