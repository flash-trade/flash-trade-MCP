import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { mockServer } from '../setup.ts'
import { FlashApiClient } from '../../src/client/flash-api.ts'
import { FlashApiError, FlashApiConnectionError } from '../../src/client/errors.ts'

const BASE = 'http://localhost:3000'
const client = new FlashApiClient({ apiBaseUrl: BASE, timeoutMs: 5000 })

describe('FlashApiClient — GET endpoints', () => {
  it('getHealth returns parsed response', async () => {
    const health = await client.getHealth()
    expect(health.status).toBe('ok')
    expect(health.positions).toBe(42)
  })

  it('getMarkets returns array', async () => {
    const markets = await client.getMarkets()
    expect(markets).toHaveLength(2)
  })

  it('getMarket returns single market', async () => {
    const market = await client.getMarket('mkt1') as any
    expect(market.pubkey).toBe('mkt1')
    expect(market.account.side).toBe('Long')
  })

  it('getPrices returns price map', async () => {
    const prices = await client.getPrices()
    expect(prices.SOL).toBeDefined()
    expect(prices.SOL.price).toBe('14852000000')
  })

  it('getPrice returns single price', async () => {
    const price = await client.getPrice('SOL')
    expect(price.price).toBe('14852000000')
    expect(price.exponent).toBe('-8')
  })

  it('getPools returns array', async () => {
    const pools = await client.getPools()
    expect(pools).toHaveLength(1)
  })

  it('getCustodies returns array', async () => {
    const custodies = await client.getCustodies()
    expect(custodies).toHaveLength(2)
  })

  it('getPositions without owner returns all', async () => {
    const positions = await client.getPositions()
    expect(positions).toHaveLength(2)
  })

  it('getPositions with owner filters', async () => {
    const positions = await client.getPositions('owner123')
    expect(positions).toHaveLength(1)
  })

  it('getOwnerPositions returns enriched data', async () => {
    const positions = await client.getOwnerPositions('owner123')
    expect(positions).toHaveLength(1)
    expect(positions[0]!.sideUi).toBe('Long')
    expect(positions[0]!.marketSymbol).toBe('SOL')
    expect(positions[0]!.leverageUi).toBe('5.00')
  })

  it('getPoolData returns pool data object', async () => {
    const data = await client.getPoolData() as any
    expect(data.pools).toHaveLength(1)
    expect(data.pools[0].poolName).toBe('Crypto.1')
  })

  it('getPoolSnapshot returns single pool', async () => {
    const snap = await client.getPoolSnapshot('pool1')
    expect(snap).toEqual({ pool: 'pool1', aum: '1000000' })
  })
})

describe('FlashApiClient — POST transaction endpoints', () => {
  it('openPosition with owner returns tx', async () => {
    const res = await client.openPosition({
      inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL', inputAmountUi: '100.0',
      leverage: 5.0, tradeType: 'LONG', owner: 'wallet123',
    })
    expect(res.newEntryPrice).toBe('148.52')
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('openPosition without owner returns preview only', async () => {
    const res = await client.openPosition({
      inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL', inputAmountUi: '100.0',
      leverage: 5.0, tradeType: 'LONG',
    })
    expect(res.newEntryPrice).toBe('148.52')
    expect(res.transactionBase64).toBeUndefined()
  })

  it('closePosition returns close preview', async () => {
    const res = await client.closePosition({
      positionKey: 'pos1', inputUsdUi: '500.00', withdrawTokenSymbol: 'USDC',
    })
    expect(res.receiveTokenSymbol).toBe('USDC')
    expect(res.settledPnl).toBe('5.23')
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('addCollateral returns collateral preview', async () => {
    const res = await client.addCollateral({
      positionKey: 'pos1', depositAmountUi: '50.0',
      depositTokenSymbol: 'USDC', owner: 'wallet123',
    })
    expect(res.existingCollateralUsd).toBe('100.00')
    expect(res.newCollateralUsd).toBe('150.00')
    expect(res.newLeverage).toBe('3.33')
    expect(res.transactionBase64).toBe('AQAAAA==')
  })

  it('removeCollateral returns withdraw preview', async () => {
    const res = await client.removeCollateral({
      positionKey: 'pos1', withdrawAmountUsdUi: '25.00',
      withdrawTokenSymbol: 'USDC', owner: 'wallet123',
    })
    expect(res.existingCollateralUsd).toBe('100.00')
    expect(res.newCollateralUsd).toBe('75.00')
    expect(res.newLeverage).toBe('6.67')
    expect(res.receiveAmountUi).toBe('25.00')
  })

  it('reversePosition returns combined preview', async () => {
    const res = await client.reversePosition({
      positionKey: 'pos1', owner: 'wallet123',
    })
    expect(res.closeReceiveUsd).toBe('105.23')
    expect(res.newSide).toBe('Short')
    expect(res.newLeverage).toBe('5.00')
    expect(res.transactionBase64).toBe('AQAAAA==')
  })
})

describe('FlashApiClient — POST preview endpoints', () => {
  it('previewLimitOrderFees returns fee data', async () => {
    const res = await client.previewLimitOrderFees({
      marketSymbol: 'SOL', inputAmountUi: '100.0',
      outputAmountUi: '0.67', side: 'LONG',
    })
    expect(res.entryPriceUi).toBe('148.52')
    expect(res.entryFeeUsdUi).toBe('0.50')
    expect(res.liquidationPriceUi).toBe('120.30')
    expect(res.borrowRateUi).toBe('0.01200')
  })

  it('previewExitFee returns exit fee data', async () => {
    const res = await client.previewExitFee({
      positionKey: 'pos1', closeAmountUsdUi: '500.00',
    })
    expect(res.exitFeeUsdUi).toBe('0.40')
    expect(res.exitPriceUi).toBe('148.52')
  })

  it('previewTpSl returns PnL data', async () => {
    const res = await client.previewTpSl({
      mode: 'forward', positionKey: 'pos1', triggerPriceUi: '160.00',
    })
    expect(res.pnlUsdUi).toBe('50.00')
    expect(res.pnlPercentage).toBe('50.00')
  })

  it('previewMargin returns margin preview', async () => {
    const res = await client.previewMargin({
      positionKey: 'pos1', marginDeltaUsdUi: '50.00', action: 'ADD',
    })
    expect(res.newLeverageUi).toBe('3.50')
    expect(res.newLiquidationPriceUi).toBe('110.00')
    expect(res.maxAmountUsdUi).toBe('500.00')
  })
})

describe('FlashApiClient — error handling', () => {
  it('HTTP 404 throws FlashApiError', async () => {
    try {
      await client.getMarket('nonexistent')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(FlashApiError)
      expect((e as FlashApiError).statusCode).toBe(404)
    }
  })

  it('HTTP 500 throws FlashApiError with correct message', async () => {
    mockServer.use(
      http.get(`${BASE}/markets`, () => new HttpResponse('Internal error', { status: 500 })),
    )
    await expect(client.getMarkets()).rejects.toThrow('Flash Trade API internal error')
  })

  it('HTTP 422 throws FlashApiError for validation', async () => {
    mockServer.use(
      http.post(`${BASE}/transaction-builder/open-position`, () =>
        new HttpResponse('Invalid leverage', { status: 422 }),
      ),
    )
    try {
      await client.openPosition({
        inputTokenSymbol: 'USDC', outputTokenSymbol: 'SOL',
        inputAmountUi: '100.0', leverage: 999, tradeType: 'LONG',
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(FlashApiError)
      expect((e as FlashApiError).statusCode).toBe(422)
      expect((e as FlashApiError).message).toContain('Validation failed')
    }
  })

  it('connection failure throws FlashApiConnectionError', async () => {
    const badClient = new FlashApiClient({ apiBaseUrl: 'http://localhost:1', timeoutMs: 1000 })
    await expect(badClient.getHealth()).rejects.toThrow(FlashApiConnectionError)
  })
})
