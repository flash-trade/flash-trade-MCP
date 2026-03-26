#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.ts'
import { FlashApiClient } from './client/flash-api.ts'
import { registerReadTools, registerTransactionTools, registerPreviewTools } from './tools/index.ts'
import { registerResources } from './resources/index.ts'
import { sanitizeError } from './sanitize.ts'

process.on('uncaughtException', (err) => {
  console.error('[flash-trade-mcp] Uncaught exception:', sanitizeError(err))
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[flash-trade-mcp] Unhandled rejection:', sanitizeError(reason))
  process.exit(1)
})

try {
  const config = loadConfig()
  const client = new FlashApiClient(config)

  const server = new McpServer({
    name: 'flash-trade',
    version: '0.4.0',
  }, {
    capabilities: {
      tools: {},
      resources: {},
    },
  })

  registerReadTools(server, client)
  registerTransactionTools(server, client)
  registerPreviewTools(server, client)
  registerResources(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
} catch (err) {
  console.error('[flash-trade-mcp] Fatal startup error:', sanitizeError(err))
  process.exit(1)
}
