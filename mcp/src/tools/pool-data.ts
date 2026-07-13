import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { formatCompactUsd, type PoolDataResponse } from './shared/custody-map.ts'

export function registerPoolDataTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_pool_data', {
    description: 'Get aggregated liquidity-pool stats: AUM (total pool value), LP price, and stablecoin percentage per pool.',
    inputSchema: {
      pool_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional().describe('Optional: one pool pubkey; omit for all pools'),
    },
  }, async ({ pool_pubkey }) => {
    if (pool_pubkey) {
      const one = await client.getPoolDataByPool(pool_pubkey)
      return { content: [{ type: 'text' as const, text: JSON.stringify(one, null, 2) }] }
    }
    const data = (await client.getPoolData()) as PoolDataResponse
    const lines = ['=== Pool Data ===', 'Pool           | AUM            | LP Price  | Stable%']
    lines.push('---------------|----------------|-----------|--------')
    for (const p of data.pools ?? []) {
      const name = (p.poolName ?? 'Unknown').padEnd(14)
      const aum = formatCompactUsd(p.lpStats?.totalPoolValueUsd).padEnd(14)
      const lp = `$${p.lpStats?.lpPrice ?? '?'}`.padEnd(9)
      const stable = `${p.lpStats?.stableCoinPercentage ?? '?'}%`
      lines.push(`${name} | ${aum} | ${lp} | ${stable}`)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
