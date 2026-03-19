import { describe, it, expect } from 'vitest'

const API_URL = process.env.FLASH_API_URL ?? 'http://localhost:3000'

describe.skipIf(!process.env.RUN_INTEGRATION)('Live API integration', () => {
  it('health check returns ok', async () => {
    const res = await fetch(`${API_URL}/health`)
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.status).toBeDefined()
  })

  it('markets returns non-empty array', async () => {
    const res = await fetch(`${API_URL}/markets`)
    const markets = (await res.json()) as unknown[]
    expect(markets.length).toBeGreaterThan(0)
  })

  it('prices returns SOL price', async () => {
    const res = await fetch(`${API_URL}/prices/SOL`)
    const price = (await res.json()) as { price: string }
    expect(price.price).toBeDefined()
    expect(Number(price.price)).toBeGreaterThan(0)
  })

  it('pools returns non-empty array', async () => {
    const res = await fetch(`${API_URL}/pools`)
    const pools = (await res.json()) as unknown[]
    expect(pools.length).toBeGreaterThan(0)
  })

  it('custodies returns non-empty array', async () => {
    const res = await fetch(`${API_URL}/custodies`)
    const custodies = (await res.json()) as unknown[]
    expect(custodies.length).toBeGreaterThan(0)
  })

  it('pool-data returns data', async () => {
    const res = await fetch(`${API_URL}/pool-data`)
    const data = (await res.json()) as Record<string, unknown>
    expect(data).toBeDefined()
    expect(Object.keys(data).length).toBeGreaterThan(0)
  })

  it('open position preview works (no owner = no tx)', async () => {
    const res = await fetch(`${API_URL}/transaction-builder/open-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL',
        inputAmountUi: '10.0', leverage: 2.0, tradeType: 'LONG',
      }),
    })
    const data = (await res.json()) as { newEntryPrice?: string; transactionBase64?: string }
    expect(data.newEntryPrice).toBeDefined()
    expect(data.transactionBase64).toBeUndefined()
  })
})
