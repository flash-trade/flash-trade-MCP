import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { mockServer } from '../setup.ts'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { FlashApiClient } from '../../src/client/flash-api.ts'
import { registerAccountSummaryTool } from '../../src/tools/account-summary.ts'
import { registerTradingOverviewTool } from '../../src/tools/trading-overview.ts'
import { registerTriggerOrderTools } from '../../src/tools/trigger-orders.ts'
import { registerHealthTools } from '../../src/tools/health.ts'
import { registerOwnerTools } from '../../src/tools/owner.ts'
import { registerSetupTools } from '../../src/tools/setup.ts'
import { registerOpenPositionTool } from '../../src/tools/open-position.ts'
import { registerWithdrawalTools } from '../../src/tools/withdrawal.ts'

const BASE = 'http://localhost:3000'
const apiClient = new FlashApiClient({ apiBaseUrl: BASE, timeoutMs: 5000 })
const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'

async function createTestMcp(registerFn: (server: McpServer, client: FlashApiClient) => void) {
  const server = new McpServer({ name: 'test', version: '0.0.1' }, { capabilities: { tools: {} } })
  registerFn(server, apiClient)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'test-client', version: '0.0.1' })
  await client.connect(clientTransport)
  return { client, cleanup: async () => { await client.close(); await server.close() } }
}

const textOf = (result: unknown): string => ((result as { content: { text: string }[] }).content[0]!.text)

describe('health_check tool', () => {
  it('reports the ER program and dev-env warning', async () => {
    const { client, cleanup } = await createTestMcp(registerHealthTools)
    try {
      const text = textOf(await client.callTool({ name: 'health_check', arguments: {} }))
      expect(text).toContain('Program: ER')
      expect(text).toContain('env=dev')
      expect(text).toContain('test spreads')
    } finally { await cleanup() }
  })
})

describe('get_account_summary tool', () => {
  it('renders positions with mark-price PnL (not the distorted indexer value)', async () => {
    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const text = textOf(await client.callTool({ name: 'get_account_summary', arguments: { owner: OWNER } }))
      expect(text).toContain(`Account Summary for ${OWNER}`)
      expect(text).toContain('Long SOL')
      expect(text).toContain('Setup: basket')
      // indexer said -$11.43; mark-price PnL at $76.29 is positive
      expect(text).toContain('PnL +$')
      expect(text).toContain('TP Long SOL')
      expect(text).toContain('SL Long SOL')
    } finally { await cleanup() }
  })

  it('shows "not set up" guidance for a fresh wallet', async () => {
    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const text = textOf(await client.callTool({ name: 'get_account_summary', arguments: { owner: 'freshowner1111111111111111111111111111111' } }))
      expect(text).toContain('NOT SET UP')
      expect(text).toContain('init_basket')
      expect(text).toContain('Positions: none')
    } finally { await cleanup() }
  })
})

describe('get_owner / get_positions tools', () => {
  it('get_positions reports collateral in positions', async () => {
    const { client, cleanup } = await createTestMcp(registerOwnerTools)
    try {
      const text = textOf(await client.callTool({ name: 'get_positions', arguments: { owner: OWNER } }))
      expect(text).toContain('Long SOL')
      expect(text).toContain('Collateral in positions: $100.00')
    } finally { await cleanup() }
  })
})

describe('get_trading_overview tool', () => {
  it('renders the markets table with prices', async () => {
    const { client, cleanup } = await createTestMcp(registerTradingOverviewTool)
    try {
      const text = textOf(await client.callTool({ name: 'get_trading_overview', arguments: {} }))
      expect(text).toContain('Trading Overview')
      expect(text).toContain('SOL')
      expect(text).toContain('Pool Utilization')
      expect(text).not.toContain('Warnings')
    } finally { await cleanup() }
  })
})

describe('setup tools — chain routing hints', () => {
  it('init_basket tells the caller to sign on base', async () => {
    const { client, cleanup } = await createTestMcp(registerSetupTools)
    try {
      const text = textOf(await client.callTool({ name: 'init_basket', arguments: { owner: OWNER } }))
      expect(text).toContain('step 1/4')
      expect(text).toContain('network="base"')
      expect(text).toContain('AQAAAA==')
    } finally { await cleanup() }
  })

  it('deposit_direct requires a mint and routes to base', async () => {
    const { client, cleanup } = await createTestMcp(registerSetupTools)
    try {
      const text = textOf(await client.callTool({ name: 'deposit_direct', arguments: { owner: OWNER, token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: '15' } }))
      expect(text).toContain('network="base"')
    } finally { await cleanup() }
  })
})

describe('open_position tool — quote mode + chain routing', () => {
  it('quote mode (no owner) builds no transaction', async () => {
    const { client, cleanup } = await createTestMcp(registerOpenPositionTool)
    try {
      const text = textOf(await client.callTool({ name: 'open_position', arguments: { input_token_symbol: 'USDC', output_token_symbol: 'SOL', input_amount: '11', leverage: '5', trade_type: 'LONG' } }))
      expect(text).toContain('Quote only')
      expect(text).not.toContain('network="er"')
    } finally { await cleanup() }
  })

  it('with owner builds a tx and routes to ER', async () => {
    const { client, cleanup } = await createTestMcp(registerOpenPositionTool)
    try {
      const text = textOf(await client.callTool({ name: 'open_position', arguments: { input_token_symbol: 'USDC', output_token_symbol: 'SOL', input_amount: '11', leverage: '5', trade_type: 'LONG', owner: OWNER } }))
      expect(text).toContain('network="er"')
      expect(text).toContain('AQAAAA==')
    } finally { await cleanup() }
  })
})

describe('trigger orders — 255 sentinel', () => {
  it('cancel_trigger_order with order_id 255 labels an ALL-cancel', async () => {
    const { client, cleanup } = await createTestMcp(registerTriggerOrderTools)
    try {
      const text = textOf(await client.callTool({ name: 'cancel_trigger_order', arguments: { market_symbol: 'SOL', side: 'LONG', order_id: 255, is_stop_loss: false, owner: OWNER } }))
      expect(text).toContain('ALL triggers')
      expect(text).toContain('network="er"')
    } finally { await cleanup() }
  })
})

describe('withdrawal tools — 0xbc4 timing note', () => {
  it('execute_withdrawal routes to base', async () => {
    const { client, cleanup } = await createTestMcp(registerWithdrawalTools)
    try {
      const text = textOf(await client.callTool({ name: 'execute_withdrawal', arguments: { owner: OWNER, token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } }))
      expect(text).toContain('network="base"')
    } finally { await cleanup() }
  })
})

// keep msw import referenced for handler overrides in future cases
void http
void HttpResponse
void mockServer
