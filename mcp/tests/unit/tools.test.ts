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
import { registerCustodyTools } from '../../src/tools/custodies.ts'
import { registerHealthTools } from '../../src/tools/health.ts'
import { registerPositionTools } from '../../src/tools/positions.ts'
import { registerOrderTools } from '../../src/tools/orders.ts'

const BASE = 'http://localhost:3000'
const apiClient = new FlashApiClient({ apiBaseUrl: BASE, timeoutMs: 5000 })

/** Create an in-process MCP server+client pair with specified tools registered */
async function createTestMcp(registerFn: (server: McpServer, client: FlashApiClient) => void) {
  const server = new McpServer({ name: 'test', version: '0.0.1' }, { capabilities: { tools: {} } })
  registerFn(server, apiClient)

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const client = new Client({ name: 'test-client', version: '0.0.1' })
  await client.connect(clientTransport)

  return { client, cleanup: async () => { await client.close(); await server.close() } }
}

// ── get_account_summary: actual tool handler tests ──

describe('get_account_summary tool', () => {
  it('returns positions, orders, and prices for a wallet', async () => {
    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const result = await client.callTool({ name: 'get_account_summary', arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Account Summary for 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
      expect(text).toContain('Long SOL')
      expect(text).toContain('$500.00')
      expect(text).toContain('PnL: $12.50')
      expect(text).toContain('TP Long SOL')
      expect(text).toContain('$160.00')
      expect(text).toContain('SL Long SOL')
      expect(text).toContain('$130.00')
      expect(text).toContain('Current Prices')
      expect(text).not.toContain('Warnings')
    } finally {
      await cleanup()
    }
  })

  it('shows "None" for empty wallet', async () => {
    mockServer.use(
      http.get(`${BASE}/positions/owner/:owner`, () => HttpResponse.json([])),
      http.get(`${BASE}/orders/owner/:owner`, () => HttpResponse.json([])),
    )

    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const result = await client.callTool({ name: 'get_account_summary', arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Positions: None')
      expect(text).toContain('Orders: None')
    } finally {
      await cleanup()
    }
  })

  it('shows partial data + warnings when orders API fails', async () => {
    mockServer.use(
      http.get(`${BASE}/orders/owner/:owner`, () => new HttpResponse('Internal error', { status: 500 })),
    )

    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const result = await client.callTool({ name: 'get_account_summary', arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } })
      const text = (result.content as any)[0].text as string

      // Positions should still be present
      expect(text).toContain('Long SOL')
      // Orders should show unavailable
      expect(text).toContain('Orders: unavailable')
      // Warning should explain what failed
      expect(text).toContain('Warnings')
      expect(text).toContain('Orders unavailable')
    } finally {
      await cleanup()
    }
  })

  it('shows partial data + warnings when prices API fails', async () => {
    mockServer.use(
      http.get(`${BASE}/prices`, () => new HttpResponse('Service unavailable', { status: 503 })),
    )

    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const result = await client.callTool({ name: 'get_account_summary', arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } })
      const text = (result.content as any)[0].text as string

      // Positions and orders should still be present
      expect(text).toContain('Long SOL')
      // No prices section
      expect(text).not.toContain('Current Prices')
      // Warning about prices
      expect(text).toContain('Prices unavailable')
    } finally {
      await cleanup()
    }
  })

  it('shows all unavailable + warnings when everything fails', async () => {
    mockServer.use(
      http.get(`${BASE}/positions/owner/:owner`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${BASE}/orders/owner/:owner`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${BASE}/prices`, () => new HttpResponse(null, { status: 500 })),
    )

    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const result = await client.callTool({ name: 'get_account_summary', arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Positions: unavailable')
      expect(text).toContain('Orders: unavailable')
      expect(text).toContain('Warnings')
      expect(text).toContain('Positions unavailable')
      expect(text).toContain('Orders unavailable')
      expect(text).toContain('Prices unavailable')
    } finally {
      await cleanup()
    }
  })

  it('safely handles orders with null sub-arrays', async () => {
    mockServer.use(
      http.get(`${BASE}/orders/owner/:owner`, () => HttpResponse.json([
        { key: 'ord2', orderAccountData: 'data', limitOrders: null, takeProfitOrders: undefined, stopLossOrders: [] },
      ])),
    )

    const { client, cleanup } = await createTestMcp(registerAccountSummaryTool)
    try {
      const result = await client.callTool({ name: 'get_account_summary', arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' } })
      const text = (result.content as any)[0].text as string

      // Should not crash — the ?? [] guards prevent TypeError
      expect(text).toContain('Account Summary')
      expect(text).toContain('Orders')
    } finally {
      await cleanup()
    }
  })
})

// ── get_trading_overview: actual tool handler tests ──

describe('get_trading_overview tool', () => {
  it('returns markets with prices and pool utilization', async () => {
    const { client, cleanup } = await createTestMcp(registerTradingOverviewTool)
    try {
      const result = await client.callTool({ name: 'get_trading_overview', arguments: {} })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Trading Overview')
      expect(text).toContain('Markets')
      expect(text).not.toContain('Warnings')
    } finally {
      await cleanup()
    }
  })

  it('shows markets without prices when prices API fails', async () => {
    mockServer.use(
      http.get(`${BASE}/prices`, () => new HttpResponse('Error', { status: 500 })),
    )

    const { client, cleanup } = await createTestMcp(registerTradingOverviewTool)
    try {
      const result = await client.callTool({ name: 'get_trading_overview', arguments: {} })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Trading Overview')
      expect(text).toContain('Warnings')
      expect(text).toContain('Prices unavailable')
    } finally {
      await cleanup()
    }
  })

  it('shows pool data warning when pool-data API fails', async () => {
    mockServer.use(
      http.get(`${BASE}/pool-data`, () => new HttpResponse('Timeout', { status: 504 })),
    )

    const { client, cleanup } = await createTestMcp(registerTradingOverviewTool)
    try {
      const result = await client.callTool({ name: 'get_trading_overview', arguments: {} })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Trading Overview')
      expect(text).not.toContain('Pool Utilization')
      expect(text).toContain('Pool data unavailable')
    } finally {
      await cleanup()
    }
  })
})

// ── Trigger order client methods ──

describe('Trigger order client methods', () => {
  it('placeTriggerOrder returns transaction', async () => {
    const res = await apiClient.placeTriggerOrder({
      marketSymbol: 'SOL', side: 'LONG',
      triggerPriceUi: '160.00', sizeAmountUi: '0.5',
      isStopLoss: false, owner: 'wallet123',
    })
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('editTriggerOrder returns transaction', async () => {
    const res = await apiClient.editTriggerOrder({
      marketSymbol: 'SOL', side: 'LONG', orderId: 0,
      triggerPriceUi: '165.00', sizeAmountUi: '0.5',
      isStopLoss: false, owner: 'wallet123',
    })
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('cancelTriggerOrder returns transaction', async () => {
    const res = await apiClient.cancelTriggerOrder({
      marketSymbol: 'SOL', side: 'LONG', orderId: 0,
      isStopLoss: false, owner: 'wallet123',
    })
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('cancelAllTriggerOrders returns transaction', async () => {
    const res = await apiClient.cancelAllTriggerOrders({
      marketSymbol: 'SOL', side: 'LONG', owner: 'wallet123',
    })
    expect(res.transactionBase64).toBe('AQAAAA==')
  })
})

// ── Trigger order tool handlers ──

describe('Trigger order tool handlers', () => {
  it('place_trigger_order returns formatted output with next-step hint', async () => {
    const { client, cleanup } = await createTestMcp(registerTriggerOrderTools)
    try {
      const result = await client.callTool({
        name: 'place_trigger_order',
        arguments: {
          market_symbol: 'SOL', side: 'LONG',
          trigger_price: '160.00', size_amount: '0.5',
          is_stop_loss: 'false', owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        },
      })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Take-Profit')
      expect(text).toContain('SOL')
      expect(text).toContain('$160.00')
      expect(text).toContain('Next: After signing, call get_orders')
    } finally {
      await cleanup()
    }
  })

  it('cancel_all_trigger_orders returns formatted output', async () => {
    const { client, cleanup } = await createTestMcp(registerTriggerOrderTools)
    try {
      const result = await client.callTool({
        name: 'cancel_all_trigger_orders',
        arguments: {
          market_symbol: 'SOL', side: 'LONG',
          owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        },
      })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Cancel All Trigger Orders')
      expect(text).toContain('SOL LONG')
    } finally {
      await cleanup()
    }
  })
})

// ── Custodies tool handler ──

describe('get_custodies tool', () => {
  it('returns formatted table, not raw JSON', async () => {
    const { client, cleanup } = await createTestMcp(registerCustodyTools)
    try {
      const result = await client.callTool({ name: 'get_custodies', arguments: {} })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('custody accounts')
      expect(text).toContain('Symbol')
      expect(text).toContain('Mint')
      expect(text).toContain('Pubkey')
      expect(text).toContain('Use get_custody with a pubkey')
      // Should NOT be raw JSON
      expect(text).not.toContain('"pubkey"')
    } finally {
      await cleanup()
    }
  })
})

// ── Health tool handler ──

describe('health_check tool', () => {
  it('returns formatted health status', async () => {
    const { client, cleanup } = await createTestMcp(registerHealthTools)
    try {
      const result = await client.callTool({ name: 'health_check', arguments: {} })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Status: ok')
      expect(text).toContain('positions: 42')
      // Should NOT show [object Object]
      expect(text).not.toContain('[object Object]')
    } finally {
      await cleanup()
    }
  })
})

// ── Positions tool handler ──

describe('get_positions tool', () => {
  it('returns enriched positions with PnL for owner', async () => {
    const { client, cleanup } = await createTestMcp(registerPositionTools)
    try {
      const result = await client.callTool({
        name: 'get_positions',
        arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
      })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('Long SOL')
      expect(text).toContain('$500.00')
      expect(text).toContain('PnL: $12.50')
      expect(text).toContain('Liq Price: $120.30')
    } finally {
      await cleanup()
    }
  })
})

// ── Orders tool handler ──

describe('get_orders tool', () => {
  it('returns enriched orders with TP/SL for owner', async () => {
    const { client, cleanup } = await createTestMcp(registerOrderTools)
    try {
      const result = await client.callTool({
        name: 'get_orders',
        arguments: { owner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
      })
      const text = (result.content as any)[0].text as string

      expect(text).toContain('order account(s)')
      expect(text).toContain('TP Long SOL')
      expect(text).toContain('$160.00')
      expect(text).toContain('SL Long SOL')
      expect(text).toContain('$130.00')
    } finally {
      await cleanup()
    }
  })
})

// ── Blockhash expiry detection (algorithm test) ──
// These test the string-matching pattern used in sign-and-send.ts.
// The exact same logic is used in the production code.

describe('Blockhash expiry detection (algorithm)', () => {
  it('detects "Blockhash not found" pattern', () => {
    const msg = 'TransactionExpiredBlockheightExceededError: Blockhash not found'
    const isExpired = msg.includes('Blockhash not found') || msg.includes('block height exceeded')
    expect(isExpired).toBe(true)
  })

  it('detects "block height exceeded" pattern', () => {
    const msg = 'Transaction was not confirmed: block height exceeded'
    const isExpired = msg.includes('Blockhash not found') || msg.includes('block height exceeded')
    expect(isExpired).toBe(true)
  })

  it('does not false-positive on normal errors', () => {
    const msg = 'Transaction simulation failed: Error processing Instruction 0'
    const isExpired = msg.includes('Blockhash not found') || msg.includes('block height exceeded')
    expect(isExpired).toBe(false)
  })

  it('does not false-positive on connection errors', () => {
    const msg = 'Failed to send transaction: Connection refused'
    const isExpired = msg.includes('Blockhash not found') || msg.includes('block height exceeded')
    expect(isExpired).toBe(false)
  })
})
