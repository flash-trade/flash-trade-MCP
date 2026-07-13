import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerTokenTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('get_tokens', {
    description:
      'List tokens for the active pool with their MINT addresses, decimals, and Token-2022 flag. ' +
      'CRITICAL: deposits and withdrawals take a MINT address (tokenMint), while trading tools take a SYMBOL. ' +
      'Always resolve a mint here before calling deposit_direct / request_withdrawal / execute_withdrawal — never hardcode a mint.',
    inputSchema: {
      symbol: z.string().max(16).optional().describe('Optional: filter to one symbol, e.g. "USDC"'),
    },
  }, async ({ symbol }) => {
    const tokens = await client.getTokens()
    const filtered = symbol
      ? tokens.filter((t) => t.symbol.toUpperCase() === symbol.toUpperCase())
      : tokens
    if (filtered.length === 0) {
      return { content: [{ type: 'text' as const, text: symbol ? `No token found for symbol "${symbol}".` : 'No tokens returned.' }] }
    }
    const lines = ['=== Tokens (active pool) ===', 'Symbol     | Mint                                         | Dec | Type']
    lines.push('-----------|----------------------------------------------|-----|--------')
    for (const t of filtered) {
      const type = t.isVirtual ? 'virtual' : t.isToken2022 ? 'token2022' : t.isStable ? 'stable' : 'spl'
      lines.push(`${t.symbol.padEnd(10)} | ${t.mint.padEnd(44)} | ${String(t.decimals).padEnd(3)} | ${type}`)
    }
    lines.push('', 'Use the Mint (not the symbol) for deposit_direct / request_withdrawal / execute_withdrawal.')
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
