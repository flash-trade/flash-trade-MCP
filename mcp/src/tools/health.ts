import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'

export function registerHealthTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('health_check', {
    description:
      'Check if the Flash Trade API is running and responsive. Returns account counts and service status. Call this first to verify connectivity before using other tools.',
  }, async () => {
    const health = await client.getHealth()
    const lines = [`Status: ${health.status}`]
    for (const [key, val] of Object.entries(health)) {
      if (key !== 'status') lines.push(`${key}: ${val}`)
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
  })
}
