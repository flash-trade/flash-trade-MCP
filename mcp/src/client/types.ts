// === Enums (match Rust API's SCREAMING_SNAKE_CASE serde) ===

export type TradeType = 'LONG' | 'SHORT'
export type OrderType = 'MARKET' | 'LIMIT'
export type MarginAction = 'ADD' | 'REMOVE'

// === Oracle Price ===

export interface OraclePrice {
  price: string
  exponent: string
  confidence: string
  timestamp: string
}

// === PnL ===

export interface PnlData {
  profitUsd: string
  lossUsd: string
  exitFeeUsd: string
  borrowFeeUsd: string
  exitFeeAmount: string
  borrowFeeAmount: string
  priceImpactUsd: string
  priceImpactSet: boolean
}

// === Enriched Position ===

export interface EnrichedPosition {
  key: string
  positionAccountData: string
  sideUi?: string
  marketSymbol?: string
  collateralSymbol?: string
  entryOraclePrice?: OraclePrice
  entryPriceUi?: string
  sizeAmountUi?: string
  sizeAmountUiKmb?: string
  sizeUsdUi?: string
  collateralAmountUi?: string
  collateralAmountUiKmb?: string
  collateralUsdUi?: string
  isDegen?: boolean
  pnl?: PnlData
  pnlWithFeeUsdUi?: string
  pnlPercentageWithFee?: string
  pnlWithoutFeeUsdUi?: string
  pnlPercentageWithoutFee?: string
  liquidationPriceUi?: string
  leverageUi?: string
}

// === Enriched Orders ===

export interface LimitOrderUi {
  market: string
  orderId: number
  sideUi: string
  symbol: string
  reserveSymbol: string
  reserveAmountUi: string
  reserveAmountUsdUi: string
  sizeAmountUi: string
  sizeAmountUiKmb: string
  sizeUsdUi: string
  collateralAmountUi: string
  collateralAmountUiKmb: string
  collateralAmountUsdUi: string
  entryOraclePrice: OraclePrice
  entryPriceUi: string
  leverageUi: string
  liquidationPriceUi: string
  limitTakeProfitPriceUi: string
  limitStopLossPriceUi: string
  receiveTokenSymbol: string
  reserveTokenSymbol: string
}

export interface TriggerOrderUi {
  market: string
  orderId: number
  sideUi: string
  symbol: string
  receiveTokenSymbol: string
  sizeAmountUi: string
  sizeAmountUiKmb: string
  sizeUsdUi: string
  type: string
  triggerPriceUi: string
  leverage: string
}

export type TakeProfitOrderUi = TriggerOrderUi
export type StopLossOrderUi = TriggerOrderUi

export interface EnrichedOrder {
  key: string
  orderAccountData: string
  limitOrders: LimitOrderUi[]
  takeProfitOrders: TakeProfitOrderUi[]
  stopLossOrders: StopLossOrderUi[]
}

// === Price (same shape as OraclePrice — aliased for semantic clarity) ===

export type PriceData = OraclePrice

// === Transaction Builder: Open Position ===

export interface OpenPositionRequest {
  inputTokenSymbol: string
  outputTokenSymbol: string
  inputAmountUi: string
  leverage: number
  tradeType: TradeType
  orderType?: OrderType
  limitPrice?: string
  degenMode?: boolean
  tradingFeeDiscountPercent?: number
  owner?: string
  slippagePercentage?: string
  takeProfit?: string
  stopLoss?: string
}

export interface TriggerQuote {
  exitPriceUi: string
  profitUsdUi: string
  lossUsdUi: string
  exitFeeUsdUi: string
  receiveUsdUi: string
  pnlPercentage: string
}

export interface OpenPositionResponse {
  oldLeverage?: string
  newLeverage: string
  oldEntryPrice?: string
  newEntryPrice: string
  oldLiquidationPrice?: string
  newLiquidationPrice: string
  entryFee: string
  entryFeeBeforeDiscount: string
  openPositionFeePercent: string
  availableLiquidity: string
  youPayUsdUi: string
  youRecieveUsdUi: string // Note: typo matches Rust API field name — do not "fix"
  marginFeePercentage: string
  outputAmount: string
  outputAmountUi: string
  transactionBase64?: string
  takeProfitQuote?: TriggerQuote
  stopLossQuote?: TriggerQuote
  err?: string
}

// === Transaction Builder: Close Position ===

export interface ClosePositionRequest {
  positionKey: string
  inputUsdUi: string
  withdrawTokenSymbol: string
  keepLeverageSame?: boolean
  slippagePercentage?: string
  tradingFeeDiscountPercent?: number
}

export interface ClosePositionResponse {
  receiveTokenSymbol: string
  receiveTokenAmountUi: string
  receiveTokenAmountUsdUi: string
  markPrice: string
  entryPrice: string
  existingLiquidationPrice: string
  newLiquidationPrice: string
  existingSize: string
  newSize: string
  existingCollateral: string
  newCollateral: string
  existingLeverage: string
  newLeverage: string
  settledPnl: string
  fees: string
  feesBeforeDiscount: string
  lockAndUnsettledFeeUsd?: string
  transactionBase64?: string
  err?: string
}

// === Transaction Builder: Add Collateral ===

export interface AddCollateralRequest {
  positionKey: string
  depositAmountUi: string
  depositTokenSymbol: string
  owner: string
  slippagePercentage?: string
}

export interface AddCollateralResponse {
  existingCollateralUsd: string
  newCollateralUsd: string
  existingLeverage: string
  newLeverage: string
  existingLiquidationPrice: string
  newLiquidationPrice: string
  depositUsdValue: string
  maxAddableUsd: string
  transactionBase64?: string
  err?: string
}

// === Transaction Builder: Remove Collateral ===

export interface RemoveCollateralRequest {
  positionKey: string
  withdrawAmountUsdUi: string
  withdrawTokenSymbol: string
  owner: string
  slippagePercentage?: string
}

export interface RemoveCollateralResponse {
  existingCollateralUsd: string
  newCollateralUsd: string
  existingLeverage: string
  newLeverage: string
  existingLiquidationPrice: string
  newLiquidationPrice: string
  receiveAmountUi: string
  receiveAmountUsdUi: string
  maxWithdrawableUsd: string
  transactionBase64?: string
  err?: string
}

// === Transaction Builder: Reverse Position ===

export interface ReversePositionRequest {
  positionKey: string
  owner: string
  slippagePercentage?: string
  tradingFeeDiscountPercent?: number
  degenMode?: boolean
}

export interface ReversePositionResponse {
  closeReceiveUsd: string
  closeFees: string
  closeSettledPnl: string
  newSide: string
  newLeverage: string
  newEntryPrice: string
  newLiquidationPrice: string
  newSizeUsd: string
  newSizeAmountUi: string
  newCollateralUsd: string
  openEntryFee: string
  transactionBase64?: string
  err?: string
}

// === Preview: Limit Order Fees ===

export interface PreviewLimitOrderFeesRequest {
  marketSymbol: string
  inputAmountUi: string
  outputAmountUi: string
  side: TradeType
  limitPrice?: string
  tradingFeeDiscountPercent?: number
}

export interface PreviewLimitOrderFeesResponse {
  entryPriceUi: string
  entryFeeUsdUi: string
  liquidationPriceUi: string
  borrowRateUi: string
  err?: string
}

// === Preview: Exit Fee ===

export interface PreviewExitFeeRequest {
  positionKey: string
  closeAmountUsdUi: string
}

export interface PreviewExitFeeResponse {
  exitFeeUsdUi: string
  exitFeeAmountUi: string
  exitPriceUi: string
  err?: string
}

// === Preview: TP/SL ===

export interface PreviewTpSlRequest {
  mode: 'forward' | 'reverse_pnl' | 'reverse_roi'
  positionKey?: string
  marketSymbol?: string
  entryPriceUi?: string
  sizeUsdUi?: string
  collateralUsdUi?: string
  side?: TradeType
  triggerPriceUi?: string
  targetPnlUsdUi?: string
  targetRoiPercent?: number
}

export interface PreviewTpSlResponse {
  pnlUsdUi?: string
  pnlPercentage?: string
  triggerPriceUi?: string
  err?: string
}

// === Preview: Margin ===

export interface PreviewMarginRequest {
  positionKey: string
  marginDeltaUsdUi: string
  action: MarginAction
}

export interface PreviewMarginResponse {
  newLeverageUi: string
  newLiquidationPriceUi: string
  maxAmountUsdUi: string
  err?: string
}

// === Transaction Builder: Place Trigger Order ===

export interface PlaceTriggerOrderRequest {
  marketSymbol: string
  side: TradeType
  triggerPriceUi: string
  sizeAmountUi: string
  isStopLoss: boolean
  owner: string
}

export interface PlaceTriggerOrderResponse {
  transactionBase64?: string
  err?: string
}

// === Transaction Builder: Edit Trigger Order ===

export interface EditTriggerOrderRequest {
  marketSymbol: string
  side: TradeType
  orderId: number
  triggerPriceUi: string
  sizeAmountUi: string
  isStopLoss: boolean
  owner: string
}

export interface EditTriggerOrderResponse {
  transactionBase64?: string
  err?: string
}

// === Transaction Builder: Cancel Trigger Order ===

export interface CancelTriggerOrderRequest {
  marketSymbol: string
  side: TradeType
  orderId: number
  isStopLoss: boolean
  owner: string
}

export interface CancelTriggerOrderResponse {
  transactionBase64?: string
  err?: string
}

// === Transaction Builder: Cancel All Trigger Orders ===

export interface CancelAllTriggerOrdersRequest {
  marketSymbol: string
  side: TradeType
  owner: string
}

export interface CancelAllTriggerOrdersResponse {
  transactionBase64?: string
  err?: string
}

// === Health ===

export interface HealthResponse {
  status: string
  [key: string]: unknown
}
