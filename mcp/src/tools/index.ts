import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { registerHealthTools } from './health.ts'
import { registerMarketTools } from './markets.ts'
import { registerPoolTools } from './pools.ts'
import { registerCustodyTools } from './custodies.ts'
import { registerPriceTools } from './prices.ts'
import { registerPositionTools } from './positions.ts'
import { registerOrderTools } from './orders.ts'
import { registerPoolDataTools } from './pool-data.ts'
import { registerAccountSummaryTool } from './account-summary.ts'
import { registerTradingOverviewTool } from './trading-overview.ts'
import { registerOpenPositionTool } from './open-position.ts'
import { registerClosePositionTool } from './close-position.ts'
import { registerCollateralTools } from './collateral.ts'
import { registerReversePositionTool } from './reverse-position.ts'
import { registerPreviewTools } from './previews.ts'
import { registerSignAndSendTool } from './sign-and-send.ts'
import { registerTriggerOrderTools } from './trigger-orders.ts'

export function registerReadTools(server: McpServer, client: FlashApiClient) {
  registerHealthTools(server, client)
  registerMarketTools(server, client)
  registerPoolTools(server, client)
  registerCustodyTools(server, client)
  registerPriceTools(server, client)
  registerPositionTools(server, client)
  registerOrderTools(server, client)
  registerPoolDataTools(server, client)
  registerAccountSummaryTool(server, client)
  registerTradingOverviewTool(server, client)
}

export function registerTransactionTools(server: McpServer, client: FlashApiClient) {
  registerOpenPositionTool(server, client)
  registerClosePositionTool(server, client)
  registerCollateralTools(server, client)
  registerReversePositionTool(server, client)
  registerTriggerOrderTools(server, client)
  registerSignAndSendTool(server)
}

export { registerPreviewTools }
