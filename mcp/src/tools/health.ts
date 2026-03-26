import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerHealthTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('health_check', {
    description:
      'Verify Flash Trade API connectivity and status. Call this first before any other tool. Returns service status and account counts.',
  }, async () => {
    const health = await client.getHealth()
    const lines = [`Status: ${health.status}`]
    for (const [key, val] of Object.entries(health)) {
      if (key !== 'status') {
        lines.push(`${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
      }
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
