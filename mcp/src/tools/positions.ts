import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { EnrichedPosition } from '../client/types.ts'

function formatEnrichedPosition(p: EnrichedPosition): string {
  const lines = [
    `${p.sideUi ?? '?'} ${p.marketSymbol ?? '?'} | ${p.key}`,
    `  Size: $${p.sizeUsdUi ?? '?'} (${p.sizeAmountUi ?? '?'} ${p.marketSymbol ?? ''})`,
    `  Collateral: $${p.collateralUsdUi ?? '?'} ${p.collateralSymbol ?? ''}`,
    `  Entry: $${p.entryPriceUi ?? '?'} | Leverage: ${p.leverageUi ?? '?'}x`,
    `  Liq Price: $${p.liquidationPriceUi ?? '?'}`,
  ]
  if (p.pnlWithFeeUsdUi) {
    lines.push(`  PnL: $${p.pnlWithFeeUsdUi} (${p.pnlPercentageWithFee ?? '?'}%)`)
  }
  return lines.join('\n')
}

export function registerPositionTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_positions', {
    description:
      'List perpetual positions, optionally filtered by wallet owner. Without an owner filter, returns ALL open positions (may be large). With owner, returns enriched positions with computed PnL, leverage, and liquidation price.',
    inputSchema: {
      owner: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().describe(
        'Wallet pubkey to filter by. When provided, returns enriched positions with PnL, leverage, and liquidation price.',
      ),
    },
  }, async ({ owner }) => {
    if (owner) {
      const positions = await client.getOwnerPositions(owner)
      if (positions.length === 0) {
        return { content: [{ type: 'text' as const, text: `No open positions for ${owner}` }] }
      }
      const text = positions.map(formatEnrichedPosition).join('\n\n')
      return { content: [{ type: 'text' as const, text: `${positions.length} position(s) for ${owner}:\n\n${text}` }] }
    }
    const positions = await client.getPositions()
    return { content: [{ type: 'text' as const, text: JSON.stringify(positions, null, 2) }] }
  })

  server.registerTool('get_position', {
    description:
      'Get a single position by its on-chain account pubkey. Returns raw position data. For enriched data (PnL, leverage, liq price), use get_positions with the owner filter instead.',
    inputSchema: { pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Position account pubkey') },
  }, async ({ pubkey }) => {
    const position = await client.getPosition(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(position, null, 2) }] }
  })
}
