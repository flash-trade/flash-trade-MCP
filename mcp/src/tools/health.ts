import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerHealthTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('health_check', {
    description:
      'Check that the Flash V2 API is reachable and see which pool config it is serving. ' +
      'Returns program (should be "ER" — the MagicBlock Ephemeral Rollup), env (dev/prod — independent of ' +
      'cluster; a dev config can carry ~10% test spreads), config version, and on-chain account counts.',
  }, async () => {
    const h = await client.getHealth()
    const lines = [
      '=== Flash V2 API Health ===',
      `Status: ${h.status}`,
      `Program: ${h.program}`,
      `Config: env=${h.config.env} source=${h.config.source} version=${h.config.version ?? '?'} branch=${h.config.branch ?? '?'}`,
      `Published: ${h.config.publishedAt ?? '?'}`,
      '',
      'Accounts:',
      ...Object.entries(h.accounts).map(([k, v]) => `  ${k}: ${v}`),
    ]
    if (h.config.env === 'dev') {
      lines.push('', 'NOTE: env=dev — this deployment may carry test spreads (~10% on some markets). Fees/PnL reflect that config.')
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
