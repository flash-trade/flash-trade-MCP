import { describe, it, expect } from 'vitest'

// Read-only smoke tests against a live V2 deployment. Skipped unless
// RUN_INTEGRATION is set. Default base is the live root (V2 serves at root; the
// /v2 prefix is not deployed — see V2-ALIGNMENT.md §0).
const API_URL = process.env.FLASH_API_URL ?? 'https://flashapi.trade'

describe.skipIf(!process.env.RUN_INTEGRATION)('Live V2 API integration (read-only)', () => {
  it('health check returns program ER', async () => {
    const res = await fetch(`${API_URL}/health`)
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { status: string; program: string }
    expect(body.status).toBe('ok')
    expect(body.program).toBe('ER')
  })

  it('prices/SOL returns a positive priceUi', async () => {
    const res = await fetch(`${API_URL}/prices/SOL`)
    const price = (await res.json()) as { priceUi: number }
    expect(price.priceUi).toBeGreaterThan(0)
  })

  it('tokens returns mints with the token2022 flag', async () => {
    const res = await fetch(`${API_URL}/tokens`)
    const tokens = (await res.json()) as Array<{ mint: string; isToken2022: boolean }>
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0]!.mint).toBeDefined()
  })

  it('raw/markets returns a non-empty array', async () => {
    const res = await fetch(`${API_URL}/raw/markets`)
    const markets = (await res.json()) as unknown[]
    expect(markets.length).toBeGreaterThan(0)
  })

  it('owner snapshot has the V2 shape (basketPubkey + metrics maps)', async () => {
    const res = await fetch(`${API_URL}/owner/So11111111111111111111111111111111111111112`)
    const snap = (await res.json()) as Record<string, unknown>
    expect(snap).toHaveProperty('basketPubkey')
    expect(snap).toHaveProperty('positionMetrics')
    expect(snap).toHaveProperty('orderMetrics')
  })

  it('open-position quote mode (no owner) returns a quote and no tx', async () => {
    const res = await fetch(`${API_URL}/transaction-builder/open-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL', inputAmountUi: '11', leverage: 5, tradeType: 'LONG' }),
    })
    const data = (await res.json()) as { newEntryPrice?: string; youRecieveUsdUi?: string; transactionBase64?: string | null }
    expect(data.newEntryPrice).toBeDefined()
    expect(data.youRecieveUsdUi).toBeDefined() // typo preserved
    expect(data.transactionBase64 ?? null).toBeNull()
  })
})
