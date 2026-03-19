import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost:3000'

export const handlers = [
  // ── Health ──
  http.get(`${BASE}/health`, () =>
    HttpResponse.json({ status: 'ok', positions: 42, markets: 8 }),
  ),

  // ── Markets ──
  http.get(`${BASE}/markets`, () =>
    HttpResponse.json([
      { pubkey: 'mkt1', symbol: 'SOL' },
      { pubkey: 'mkt2', symbol: 'BTC' },
    ]),
  ),
  http.get(`${BASE}/markets/:pubkey`, ({ params }) => {
    if (params.pubkey === 'mkt1') return HttpResponse.json({ pubkey: 'mkt1', symbol: 'SOL' })
    return new HttpResponse(null, { status: 404 })
  }),

  // ── Pools ──
  http.get(`${BASE}/pools`, () => HttpResponse.json([{ pubkey: 'pool1', name: 'Crypto.1' }])),
  http.get(`${BASE}/pools/:pubkey`, ({ params }) => {
    if (params.pubkey === 'pool1') return HttpResponse.json({ pubkey: 'pool1', name: 'Crypto.1' })
    return new HttpResponse(null, { status: 404 })
  }),

  // ── Custodies ──
  http.get(`${BASE}/custodies`, () => HttpResponse.json([{ pubkey: 'cust1', symbol: 'USDC' }])),
  http.get(`${BASE}/custodies/:pubkey`, ({ params }) => {
    if (params.pubkey === 'cust1') return HttpResponse.json({ pubkey: 'cust1', symbol: 'USDC' })
    return new HttpResponse(null, { status: 404 })
  }),

  // ── Prices ──
  http.get(`${BASE}/prices`, () =>
    HttpResponse.json({
      SOL: { price: '14852000000', exponent: '-8', confidence: '0', timestamp: '1707900000' },
      BTC: { price: '6700000000000', exponent: '-8', confidence: '0', timestamp: '1707900000' },
    }),
  ),
  http.get(`${BASE}/prices/:symbol`, ({ params }) => {
    const sym = (params.symbol as string).toUpperCase()
    if (sym === 'SOL') {
      return HttpResponse.json({ price: '14852000000', exponent: '-8', confidence: '0', timestamp: '1707900000' })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // ── Positions ──
  http.get(`${BASE}/positions`, ({ request }) => {
    const url = new URL(request.url)
    const owner = url.searchParams.get('owner')
    if (owner) return HttpResponse.json([{ pubkey: 'pos1', owner }])
    return HttpResponse.json([{ pubkey: 'pos1' }, { pubkey: 'pos2' }])
  }),
  http.get(`${BASE}/positions/:pubkey`, ({ params }) =>
    HttpResponse.json({ pubkey: params.pubkey, side: 1 }),
  ),
  http.get(`${BASE}/positions/owner/:owner`, () =>
    HttpResponse.json([{
      key: 'pos1', positionAccountData: 'base64data', sideUi: 'Long', marketSymbol: 'SOL',
      collateralSymbol: 'USDC', entryPriceUi: '148.52', sizeUsdUi: '500.00',
      leverageUi: '5.00', liquidationPriceUi: '120.30',
      pnlWithFeeUsdUi: '12.50', pnlPercentageWithFee: '12.50',
    }]),
  ),

  // ── Orders ──
  http.get(`${BASE}/orders`, () => HttpResponse.json([])),
  http.get(`${BASE}/orders/:pubkey`, ({ params }) =>
    HttpResponse.json({ pubkey: params.pubkey }),
  ),
  http.get(`${BASE}/orders/owner/:owner`, () => HttpResponse.json([])),

  // ── Pool Data ──
  http.get(`${BASE}/pool-data`, () => HttpResponse.json([{ pool: 'pool1', aum: '1000000' }])),
  http.get(`${BASE}/pool-data/:pubkey`, ({ params }) =>
    HttpResponse.json({ pool: params.pubkey, aum: '1000000' }),
  ),

  // ── Transaction Builder: Open Position ──
  http.post(`${BASE}/transaction-builder/open-position`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      newLeverage: '5.00', newEntryPrice: '148.52', newLiquidationPrice: '120.30',
      entryFee: '0.45', entryFeeBeforeDiscount: '0.50', openPositionFeePercent: '0.03600',
      availableLiquidity: '1234567.89', youPayUsdUi: '100.00', youRecieveUsdUi: '500.00',
      marginFeePercentage: '0.00800', outputAmount: '3370000000', outputAmountUi: '3.37',
      transactionBase64: body.owner ? 'AQAAAA==' : undefined,
    })
  }),

  // ── Transaction Builder: Close Position ──
  http.post(`${BASE}/transaction-builder/close-position`, () =>
    HttpResponse.json({
      receiveTokenSymbol: 'USDC', receiveTokenAmountUi: '105.23', receiveTokenAmountUsdUi: '105.23',
      markPrice: '148.52', entryPrice: '145.00', existingLiquidationPrice: '120.30',
      newLiquidationPrice: '0.00', existingSize: '500.00', newSize: '0.00',
      existingCollateral: '100.00', newCollateral: '0.00', existingLeverage: '5.00',
      newLeverage: '0.00', settledPnl: '5.23', fees: '0.36', feesBeforeDiscount: '0.40',
      transactionBase64: 'AQAAAA==',
    }),
  ),

  // ── Transaction Builder: Add Collateral ──
  http.post(`${BASE}/transaction-builder/add-collateral`, () =>
    HttpResponse.json({
      existingCollateralUsd: '100.00', newCollateralUsd: '150.00',
      existingLeverage: '5.00', newLeverage: '3.33',
      existingLiquidationPrice: '120.30', newLiquidationPrice: '105.00',
      depositUsdValue: '50.00', maxAddableUsd: '10000.00',
      transactionBase64: 'AQAAAA==',
    }),
  ),

  // ── Transaction Builder: Remove Collateral ──
  http.post(`${BASE}/transaction-builder/remove-collateral`, () =>
    HttpResponse.json({
      existingCollateralUsd: '100.00', newCollateralUsd: '75.00',
      existingLeverage: '5.00', newLeverage: '6.67',
      existingLiquidationPrice: '120.30', newLiquidationPrice: '130.00',
      receiveAmountUi: '25.00', receiveAmountUsdUi: '25.00',
      maxWithdrawableUsd: '80.00', transactionBase64: 'AQAAAA==',
    }),
  ),

  // ── Transaction Builder: Reverse Position ──
  http.post(`${BASE}/transaction-builder/reverse-position`, () =>
    HttpResponse.json({
      closeReceiveUsd: '105.23', closeFees: '0.36', closeSettledPnl: '5.23',
      newSide: 'Short', newLeverage: '5.00', newEntryPrice: '148.52',
      newLiquidationPrice: '175.00', newSizeUsd: '500.00', newSizeAmountUi: '3.37',
      newCollateralUsd: '98.00', openEntryFee: '0.45',
      transactionBase64: 'AQAAAA==',
    }),
  ),

  // ── Preview: Limit Order Fees ──
  http.post(`${BASE}/preview/limit-order-fees`, () =>
    HttpResponse.json({
      entryPriceUi: '148.52', entryFeeUsdUi: '0.50',
      liquidationPriceUi: '120.30', borrowRateUi: '0.01200',
    }),
  ),

  // ── Preview: Exit Fee ──
  http.post(`${BASE}/preview/exit-fee`, () =>
    HttpResponse.json({
      exitFeeUsdUi: '0.40', exitFeeAmountUi: '0.002700', exitPriceUi: '148.52',
    }),
  ),

  // ── Preview: TP/SL ──
  http.post(`${BASE}/preview/tp-sl`, () =>
    HttpResponse.json({ pnlUsdUi: '50.00', pnlPercentage: '50.00' }),
  ),

  // ── Preview: Margin ──
  http.post(`${BASE}/preview/margin`, () =>
    HttpResponse.json({
      newLeverageUi: '3.50', newLiquidationPriceUi: '110.00', maxAmountUsdUi: '500.00',
    }),
  ),
]
