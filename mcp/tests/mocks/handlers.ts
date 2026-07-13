import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost:3000'
const TX = { transactionBase64: 'AQAAAA==' }

const SOL_PRICE = { price: 7629317676, exponent: -8, confidence: 0, priceUi: 76.29, timestampUs: 1783923183400000, marketSession: 'regular' }
const BTC_PRICE = { price: 6700000000000, exponent: -8, confidence: 0, priceUi: 67000, timestampUs: 1783923183400000, marketSession: 'regular' }

const OWNER_SNAPSHOT = {
  owner: 'owner123',
  basketPubkey: 'BASKETpda1111111111111111111111111111111111',
  basketData: 'base64basket',
  positionMetrics: {
    'MKT1111111111111111111111111111111111111111': {
      marketSymbol: 'SOL', collateralSymbol: 'USDC', sideUi: 'Long',
      entryPriceUi: '70.00', sizeAmountUi: '7.14', sizeUsdUi: '500.00',
      collateralAmountUi: '100.00', collateralUsdUi: '100.00',
      pnlWithFeeUsdUi: '-11.43', pnlPercentageWithFee: '-11.43',
      pnlWithoutFeeUsdUi: '45.00', pnlPercentageWithoutFee: '45.00',
      liquidationPriceUi: '58.00', leverageUi: '5.00',
      profitUsd: '45000000', lossUsd: '0', exitFeeUsd: '250000', borrowFeeUsd: '120000',
      totalFeeUsd: '370000', leverage: '50000', marginUsd: '100000000',
      liquidationPrice: { price: '58', exponent: 0, confidence: '0', timestamp: '0' },
      exitPrice: { price: '76', exponent: 0, confidence: '0', timestamp: '0' },
    },
  },
  orderMetrics: {
    'MKT1111111111111111111111111111111111111111': {
      marketSymbol: 'SOL', sideUi: 'Long',
      limitOrders: [],
      takeProfitOrders: [{ orderId: 0, type: 'TP', triggerPriceUi: '90.00', sizeAmountUi: '7.14', sizeUsdUi: '640.00' }],
      stopLossOrders: [{ orderId: 1, type: 'SL', triggerPriceUi: '60.00', sizeAmountUi: '7.14', sizeUsdUi: '420.00' }],
    },
  },
}

const EMPTY_SNAPSHOT = { owner: 'freshowner', basketPubkey: null, basketData: null, positionMetrics: {}, orderMetrics: {} }

export const handlers = [
  // ── Reads ──
  http.get(`${BASE}/health`, () => HttpResponse.json({
    status: 'ok', program: 'ER',
    accounts: { pools: 10, custodies: 75, markets: 127, baskets: 1136, deposit_ledgers: 1135 },
    config: { source: 'cdn', env: 'dev', version: 'abc123', branch: 'dev', publishedAt: '2026-07-11T19:10:39Z', pools: 9, markets: 125, tokens: 74 },
  })),

  http.get(`${BASE}/tokens`, () => HttpResponse.json([
    { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, isStable: true, isVirtual: false, isToken2022: false, lazerId: 7 },
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, isStable: false, isVirtual: false, isToken2022: false, lazerId: 6 },
  ])),

  http.get(`${BASE}/prices`, () => HttpResponse.json({ SOL: SOL_PRICE, BTC: BTC_PRICE })),
  http.get(`${BASE}/prices/:symbol`, ({ params }) => {
    const sym = (params.symbol as string).toUpperCase()
    if (sym === 'SOL') return HttpResponse.json(SOL_PRICE)
    if (sym === 'BTC') return HttpResponse.json(BTC_PRICE)
    return new HttpResponse(null, { status: 404 })
  }),

  http.get(`${BASE}/raw/markets`, () => HttpResponse.json([
    { pubkey: 'MKT1111111111111111111111111111111111111111', account: { side: 'Long', target_custody: 'cust1', collateral_custody: 'cust2', pool: 'pool1', permissions: { allow_open_position: true, allow_close_position: true } } },
    { pubkey: 'MKT2222222222222222222222222222222222222222', account: { side: 'Short', target_custody: 'cust1', collateral_custody: 'cust2', pool: 'pool1', permissions: { allow_open_position: true, allow_close_position: true } } },
  ])),
  http.get(`${BASE}/raw/markets/:pubkey`, ({ params }) => {
    if ((params.pubkey as string).startsWith('MKT1')) return HttpResponse.json({ pubkey: params.pubkey, account: { side: 'Long', target_custody: 'cust1' } })
    return new HttpResponse(null, { status: 404 })
  }),
  http.get(`${BASE}/raw/pools`, () => HttpResponse.json([{ pubkey: 'pool1', account: { name: 'Crypto.1' } }])),
  http.get(`${BASE}/raw/pools/:pubkey`, ({ params }) => HttpResponse.json({ pubkey: params.pubkey, account: { name: 'Crypto.1' } })),
  http.get(`${BASE}/raw/custodies`, () => HttpResponse.json([
    { pubkey: 'cust1', account: { mint: { key: 'So11111111111111111111111111111111111111112' } } },
    { pubkey: 'cust2', account: { mint: { key: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } } },
  ])),
  http.get(`${BASE}/raw/custodies/:pubkey`, ({ params }) => HttpResponse.json({ pubkey: params.pubkey, account: {} })),
  http.get(`${BASE}/raw/baskets/:pubkey`, ({ params }) => HttpResponse.json({ pubkey: params.pubkey, account: { positions: [], orders: [] } })),

  http.get(`${BASE}/owner/:owner`, ({ params }) => {
    if (String(params.owner).startsWith('fresh')) return HttpResponse.json({ ...EMPTY_SNAPSHOT, owner: params.owner })
    return HttpResponse.json({ ...OWNER_SNAPSHOT, owner: params.owner })
  }),

  http.get(`${BASE}/pool-data`, () => HttpResponse.json({
    pools: [{
      poolName: 'Crypto.1', poolAddress: 'pool1',
      custodyStats: [
        { symbol: 'SOL', custodyAccount: 'cust1', maxLeverage: '100.00' },
        { symbol: 'USDC', custodyAccount: 'cust2', maxLeverage: '1.00' },
      ],
      lpStats: { totalPoolValueUsd: '1000000', lpPrice: '1.05', stableCoinPercentage: '45.2' },
    }],
  })),
  http.get(`${BASE}/pool-data/:pubkey`, ({ params }) => HttpResponse.json({ pool: params.pubkey, aum: '1000000' })),

  // ── Trading builders (ER) ──
  http.post(`${BASE}/transaction-builder/open-position`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      newLeverage: '5.00', newEntryPrice: '76.29', newLiquidationPrice: '60.30',
      entryFee: '0.45', entryFeeBeforeDiscount: '0.50', openPositionFeePercent: '0.03600',
      availableLiquidity: '1234567.89', youPayUsdUi: '100.00', youRecieveUsdUi: '500.00',
      marginFeePercentage: '0.00800', outputAmount: '3370000000', outputAmountUi: '3.37',
      passesMaxPositionSize: true, maxPositionSizeUsd: '2000000',
      transactionBase64: body.owner ? 'AQAAAA==' : null,
    })
  }),
  http.post(`${BASE}/transaction-builder/close-position`, () => HttpResponse.json({
    receiveTokenSymbol: 'USDC', receiveTokenAmountUi: '105.23', receiveTokenAmountUsdUi: '105.23',
    markPrice: '76.29', entryPrice: '70.00', existingLiquidationPrice: '58.00', newLiquidationPrice: '0.00',
    existingSize: '500.00', newSize: '0.00', existingCollateral: '100.00', newCollateral: '0.00',
    existingLeverage: '5.00', newLeverage: '0.00', settledPnl: '5.23', fees: '0.36', feesBeforeDiscount: '0.40',
    ...TX,
  })),
  http.post(`${BASE}/transaction-builder/reverse-position`, () => HttpResponse.json({
    closeReceiveUsd: '105.23', closeFees: '0.36', closeSettledPnl: '5.23', newSide: 'Short',
    newLeverage: '5.00', newEntryPrice: '76.29', newLiquidationPrice: '95.00', newSizeUsd: '500.00',
    newSizeAmountUi: '3.37', newCollateralUsd: '98.00', openEntryFee: '0.45', ...TX,
  })),
  http.post(`${BASE}/transaction-builder/add-collateral`, () => HttpResponse.json({
    existingCollateralUsd: '100.00', newCollateralUsd: '150.00', existingLeverage: '5.00', newLeverage: '3.33',
    existingLiquidationPrice: '58.00', newLiquidationPrice: '50.00', depositUsdValue: '50.00', maxAddableUsd: '10000.00', ...TX,
  })),
  http.post(`${BASE}/transaction-builder/remove-collateral`, () => HttpResponse.json({
    existingCollateralUsd: '100.00', newCollateralUsd: '75.00', existingLeverage: '5.00', newLeverage: '6.67',
    existingLiquidationPrice: '58.00', newLiquidationPrice: '64.00', receiveAmountUi: '25.00', receiveAmountUsdUi: '25.00', maxWithdrawableUsd: '80.00', ...TX,
  })),
  http.post(`${BASE}/transaction-builder/place-tp-sl`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/place-trigger-order`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/edit-trigger-order`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/cancel-trigger-order`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/cancel-all-trigger-orders`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/edit-limit-order`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/cancel-limit-order`, () => HttpResponse.json(TX)),

  // ── Setup + withdrawal builders (base) ──
  http.post(`${BASE}/transaction-builder/init-basket`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/init-deposit-ledger`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/delegate-basket`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/deposit-direct`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/request-withdrawal`, () => HttpResponse.json(TX)),
  http.post(`${BASE}/transaction-builder/execute-withdrawal`, () => HttpResponse.json(TX)),

  // ── Previews ──
  http.post(`${BASE}/preview/limit-order-fees`, () => HttpResponse.json({ entryPriceUi: '76.29', entryFeeUsdUi: '0.50', liquidationPriceUi: '60.30', borrowRateUi: '0.01200' })),
  http.post(`${BASE}/preview/exit-fee`, () => HttpResponse.json({ exitFeeUsdUi: '0.40', exitFeeAmountUi: '0.002700', exitPriceUi: '76.29' })),
  http.post(`${BASE}/preview/tp-sl`, () => HttpResponse.json({ pnlUsdUi: '50.00', pnlPercentage: '50.00' })),
  http.post(`${BASE}/preview/margin`, () => HttpResponse.json({ newLeverageUi: '3.50', newLiquidationPriceUi: '55.00', maxAmountUsdUi: '500.00' })),
]
