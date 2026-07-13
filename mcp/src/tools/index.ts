import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import type { FlashMcpConfig } from '../config.ts'

import { registerHealthTools } from './health.ts'
import { registerTokenTools } from './tokens.ts'
import { registerPriceTools } from './prices.ts'
import { registerMarketTools } from './markets.ts'
import { registerPoolTools } from './pools.ts'
import { registerCustodyTools } from './custodies.ts'
import { registerPoolDataTools } from './pool-data.ts'
import { registerOwnerTools } from './owner.ts'
import { registerBasketTools } from './basket.ts'
import { registerAccountSummaryTool } from './account-summary.ts'
import { registerTradingOverviewTool } from './trading-overview.ts'

import { registerSetupTools } from './setup.ts'
import { registerOpenPositionTool } from './open-position.ts'
import { registerClosePositionTool } from './close-position.ts'
import { registerCollateralTools } from './collateral.ts'
import { registerReversePositionTool } from './reverse-position.ts'
import { registerTriggerOrderTools } from './trigger-orders.ts'
import { registerTpSlTool } from './tp-sl.ts'
import { registerLimitOrderTools } from './limit-orders.ts'
import { registerWithdrawalTools } from './withdrawal.ts'
import { registerSignAndSendTool } from './sign-and-send.ts'
import { registerPreviewTools } from './previews.ts'

export function registerReadTools(server: McpServer, client: FlashApiClient) {
  registerHealthTools(server, client)
  registerTokenTools(server, client)
  registerPriceTools(server, client)
  registerMarketTools(server, client)
  registerPoolTools(server, client)
  registerCustodyTools(server, client)
  registerPoolDataTools(server, client)
  registerOwnerTools(server, client)
  registerBasketTools(server, client)
  registerAccountSummaryTool(server, client)
  registerTradingOverviewTool(server, client)
}

export function registerTransactionTools(server: McpServer, client: FlashApiClient, config: FlashMcpConfig) {
  registerSetupTools(server, client)
  registerOpenPositionTool(server, client)
  registerClosePositionTool(server, client)
  registerCollateralTools(server, client)
  registerReversePositionTool(server, client)
  registerTriggerOrderTools(server, client)
  registerTpSlTool(server, client)
  registerLimitOrderTools(server, client)
  registerWithdrawalTools(server, client)
  registerSignAndSendTool(server, config)
}

export { registerPreviewTools }
