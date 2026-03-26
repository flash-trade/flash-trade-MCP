import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { buildCustodySymbolMap, type PoolDataResponse } from './shared/custody-map.ts'
import { sanitizeError } from '../sanitize.ts'

export function registerCustodyTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_custodies', {
    description:
      'List all custody accounts (token vaults) across pools. Returns a compact summary with symbol, pool, and pubkey. Use get_custody with a specific pubkey for full details (utilization, fees, limits).',
  }, async () => {
    const [custResult, poolResult] = await Promise.allSettled([
      client.getCustodies(),
      client.getPoolData() as unknown as Promise<PoolDataResponse>,
    ])

    const custodies = custResult.status === 'fulfilled' ? custResult.value as any[] : []
    const custodyMap = poolResult.status === 'fulfilled' ? buildCustodySymbolMap(poolResult.value) : new Map()

    if (custodies.length === 0) {
      const err = custResult.status === 'rejected' ? `: ${sanitizeError((custResult as PromiseRejectedResult).reason)}` : ''
      return { content: [{ type: 'text' as const, text: `No custody accounts found${err}` }] }
    }

    const lines = [
      `${custodies.length} custody accounts:\n`,
      'Symbol     | Pool           | Pubkey',
      '-----------|----------------|----------------------------------------------',
    ]
    for (const c of custodies) {
      const info = custodyMap.get(c.pubkey)
      const symbol = (info?.symbol ?? '?').padEnd(10)
      const pool = (info?.pool ?? '?').padEnd(14)
      lines.push(`${symbol} | ${pool} | ${c.pubkey}`)
    }
    lines.push('\nUse get_custody with a pubkey for full details (utilization, fees, limits).')
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })

  server.registerTool('get_custody', {
    description:
      'Get detailed custody information for a specific custody account. Includes utilization, fees, and limits.',
    inputSchema: { pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).describe('Solana pubkey of the custody account') },
  }, async ({ pubkey }) => {
    const custody = await client.getCustody(pubkey)
    return { content: [{ type: 'text' as const, text: JSON.stringify(custody, null, 2) }] }
  })
}
