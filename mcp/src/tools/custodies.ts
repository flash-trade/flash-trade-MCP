import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

interface CustodyEntry {
  pubkey: string
  account?: {
    symbol?: string
    mint?: { key?: string; symbol?: string } | string
  }
}

export function registerCustodyTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_custodies', {
    description:
      'List all custody accounts (token vaults) across pools. Returns a compact summary with symbol, mint, and pubkey. Use get_custody with a specific pubkey for full details (utilization, fees, limits).',
  }, async () => {
    const custodies = await client.getCustodies() as CustodyEntry[]
    const lines = [
      `${custodies.length} custody accounts:\n`,
      'Symbol     | Mint                                         | Pubkey',
      '-----------|----------------------------------------------|----------------------------------------------',
    ]
    for (const c of custodies) {
      const acct = c.account ?? {}
      const mintObj = typeof acct.mint === 'object' ? acct.mint : null
      const symbol = (acct.symbol ?? mintObj?.symbol ?? '?').toString().padEnd(10)
      const mint = (mintObj?.key ?? (typeof acct.mint === 'string' ? acct.mint : '?')).toString().slice(0, 44).padEnd(44)
      lines.push(`${symbol} | ${mint} | ${c.pubkey}`)
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
