import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { mockServer } from '../setup.ts'
import { FlashApiClient } from '../../src/client/flash-api.ts'
import { FlashApiError, FlashApiConnectionError } from '../../src/client/errors.ts'

const BASE = 'http://localhost:3000'
const client = new FlashApiClient({ apiBaseUrl: BASE, timeoutMs: 5000 })

describe('FlashApiClient — reads', () => {
  it('getHealth returns V2 shape (program ER)', async () => {
    const h = await client.getHealth()
    expect(h.status).toBe('ok')
    expect(h.program).toBe('ER')
    expect(h.accounts.baskets).toBe(1136)
    expect(h.config.env).toBe('dev')
  })

  it('getTokens returns mints + token2022 flag', async () => {
    const tokens = await client.getTokens()
    expect(tokens).toHaveLength(2)
    expect(tokens[0]!.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    expect(tokens[1]!.isToken2022).toBe(false)
  })

  it('getPrices returns priceUi directly', async () => {
    const prices = await client.getPrices()
    expect(prices.SOL!.priceUi).toBe(76.29)
    expect(prices.SOL!.marketSession).toBe('regular')
  })

  it('getPrice returns a single price', async () => {
    const p = await client.getPrice('SOL')
    expect(p.priceUi).toBe(76.29)
  })

  it('getMarkets hits /raw/markets', async () => {
    const markets = await client.getMarkets()
    expect(markets).toHaveLength(2)
  })

  it('getPools / getCustodies hit /raw/*', async () => {
    expect(await client.getPools()).toHaveLength(1)
    expect(await client.getCustodies()).toHaveLength(2)
  })

  it('getOwner returns the consolidated basket snapshot', async () => {
    const snap = await client.getOwner('owner123')
    expect(snap.basketPubkey).toBeTruthy()
    expect(Object.values(snap.positionMetrics)).toHaveLength(1)
    expect(Object.values(snap.orderMetrics)).toHaveLength(1)
  })

  it('getOwner reports basketPubkey null for a fresh wallet', async () => {
    const snap = await client.getOwner('freshowner')
    expect(snap.basketPubkey).toBeNull()
    expect(Object.keys(snap.positionMetrics)).toHaveLength(0)
  })

  it('getPoolData returns aggregated stats', async () => {
    const data = await client.getPoolData() as { pools: { poolName: string }[] }
    expect(data.pools[0]!.poolName).toBe('Crypto.1')
  })
})

describe('FlashApiClient — transaction builders', () => {
  it('openPosition with owner returns a tx', async () => {
    const res = await client.openPosition({ inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL', inputAmountUi: '100', leverage: 5, tradeType: 'LONG', owner: 'wallet123' })
    expect(res.newEntryPrice).toBe('76.29')
    expect(res.youRecieveUsdUi).toBe('500.00') // typo preserved
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('openPosition without owner is quote-only (null tx)', async () => {
    const res = await client.openPosition({ inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL', inputAmountUi: '100', leverage: 5, tradeType: 'LONG' })
    expect(res.newEntryPrice).toBe('76.29')
    expect(res.transactionBase64).toBeNull()
  })

  it('closePosition uses marketSymbol + side (not positionKey)', async () => {
    const res = await client.closePosition({ marketSymbol: 'SOL', side: 'LONG', inputUsdUi: '0', withdrawTokenSymbol: 'USDC', owner: 'wallet123' })
    expect(res.settledPnl).toBe('5.23')
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('setup builders return a tx', async () => {
    expect((await client.initBasket({ owner: 'w' })).transactionBase64).toBe('AQAAAA==')
    expect((await client.initDepositLedger({ owner: 'w' })).transactionBase64).toBe('AQAAAA==')
    expect((await client.delegateBasket({ payer: 'w', owner: 'w' })).transactionBase64).toBe('AQAAAA==')
    expect((await client.depositDirect({ owner: 'w', tokenMint: 'm', amount: '15' })).transactionBase64).toBe('AQAAAA==')
  })

  it('withdrawal builders return a tx', async () => {
    expect((await client.requestWithdrawal({ owner: 'w', tokenMint: 'm', amount: '1' })).transactionBase64).toBe('AQAAAA==')
    expect((await client.executeWithdrawal({ owner: 'w', tokenMint: 'm' })).transactionBase64).toBe('AQAAAA==')
  })

  it('place_tp_sl / limit builders return a tx', async () => {
    expect((await client.placeTpSl({ marketSymbol: 'SOL', side: 'LONG', sizeAmountUi: '1', takeProfitUi: '90', owner: 'w' })).transactionBase64).toBe('AQAAAA==')
    expect((await client.editLimitOrder({ marketSymbol: 'SOL', side: 'LONG', orderId: 0, owner: 'w' })).transactionBase64).toBe('AQAAAA==')
    expect((await client.cancelLimitOrder({ marketSymbol: 'SOL', side: 'LONG', orderId: 0, owner: 'w' })).transactionBase64).toBe('AQAAAA==')
  })
})

describe('FlashApiClient — four error channels', () => {
  it('body-err: HTTP 200 with err throws', async () => {
    mockServer.use(http.post(`${BASE}/transaction-builder/open-position`, () => HttpResponse.json({ err: 'insufficient liquidity' })))
    try {
      await client.openPosition({ inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL', inputAmountUi: '100', leverage: 5, tradeType: 'LONG', owner: 'w' })
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(FlashApiError)
      expect((e as FlashApiError).channel).toBe('body-err')
      expect((e as FlashApiError).message).toContain('insufficient liquidity')
    }
  })

  it('http-400: plain-text price validation', async () => {
    mockServer.use(http.post(`${BASE}/transaction-builder/place-trigger-order`, () => new HttpResponse('trigger price below mark', { status: 400 })))
    try {
      await client.placeTriggerOrder({ marketSymbol: 'SOL', side: 'LONG', triggerPriceUi: '1', sizeAmountUi: '1', isStopLoss: false, owner: 'w' })
      expect.unreachable('should throw')
    } catch (e) {
      expect((e as FlashApiError).channel).toBe('http-400')
    }
  })

  it('http-422: serde missing-field validation', async () => {
    mockServer.use(http.post(`${BASE}/transaction-builder/deposit-direct`, () => new HttpResponse('Failed to deserialize the JSON body: missing field `owner`', { status: 422 })))
    try {
      await client.depositDirect({ owner: '', tokenMint: 'm', amount: '1' })
      expect.unreachable('should throw')
    } catch (e) {
      expect((e as FlashApiError).channel).toBe('http-422')
      expect((e as FlashApiError).message).toContain('missing field')
    }
  })

  it('http-500: empty-body setup failure', async () => {
    mockServer.use(http.post(`${BASE}/transaction-builder/init-basket`, () => new HttpResponse(null, { status: 500 })))
    try {
      await client.initBasket({ owner: 'w' })
      expect.unreachable('should throw')
    } catch (e) {
      expect((e as FlashApiError).channel).toBe('http-500')
      expect((e as FlashApiError).hint).toContain('server-side')
    }
  })

  it('http-other: 404 route not found', async () => {
    try {
      await client.getPrice('NOPE')
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(FlashApiError)
      expect((e as FlashApiError).status).toBe(404)
    }
  })

  it('connection failure throws FlashApiConnectionError', async () => {
    const bad = new FlashApiClient({ apiBaseUrl: 'http://localhost:1', timeoutMs: 800 })
    await expect(bad.getHealth()).rejects.toThrow(FlashApiConnectionError)
  })
})
