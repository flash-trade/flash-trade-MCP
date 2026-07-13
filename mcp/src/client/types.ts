// ─────────────────────────────────────────────────────────────────────────────
// types.ts — TypeScript types for the live Flash V2 (MagicBlock ER) REST API.
// Faithful to the deployed backend (probed 2026-07-13), not just the spec.
// Conventions:
//   • All amounts/prices are UI DECIMAL STRINGS ("11.5") unless a field name
//     says otherwise (raw native fields are called out inline).
//   • V2 reuses V1-shaped response DTOs: `swap*` fields are ALWAYS null on the
//     ER, and `youRecieveUsdUi` is genuinely misspelled — mirrored verbatim.
//   • Responses may carry MORE fields than typed here (the backend adds fields
//     over time); these interfaces are structural — extra fields are ignored,
//     never rejected.
// ─────────────────────────────────────────────────────────────────────────────

export type TradeType = 'LONG' | 'SHORT'
export type OrderType = 'MARKET' | 'LIMIT'
export type MarginAction = 'ADD' | 'REMOVE'

// ── Requests: trading (ER chain) ─────────────────────────────────────────────

export interface OpenPositionRequest {
  inputTokenSymbol: string
  outputTokenSymbol: string
  inputAmountUi: string
  leverage: number
  tradeType: TradeType
  orderType?: OrderType
  limitPrice?: string
  takeProfit?: string
  stopLoss?: string
  owner?: string          // omit → preview-only quote (no transactionBase64)
  slippagePercentage?: string
  signer?: string         // session signer pubkey
  sessionToken?: string   // session token account
}

export interface ClosePositionRequest {
  marketSymbol: string
  side: TradeType
  inputUsdUi: string      // USD notional to close; "0" or ≥97% of size = FULL close
  withdrawTokenSymbol: string
  owner: string
  slippagePercentage?: string
  signer?: string
  sessionToken?: string
}

export interface ReversePositionRequest {
  marketSymbol: string
  side: TradeType         // CURRENT side; the new position is the opposite
  leverage: number        // leverage for the NEW side
  owner: string
  slippagePercentage?: string
  signer?: string
  sessionToken?: string
}

export interface AddCollateralRequest {
  marketSymbol: string
  side: TradeType
  depositAmountUi: string
  depositTokenSymbol: string
  owner: string
  slippagePercentage?: string
  signer?: string
  sessionToken?: string
}

export interface RemoveCollateralRequest {
  marketSymbol: string
  side: TradeType
  withdrawAmountUsdUi: string
  withdrawTokenSymbol: string
  owner: string
  slippagePercentage?: string
  signer?: string
  sessionToken?: string
}

export interface PlaceTriggerOrderRequest {
  marketSymbol: string
  side: TradeType
  triggerPriceUi: string
  sizeAmountUi: string    // target-token size to close when it fires
  isStopLoss: boolean
  owner: string
  signer?: string
  sessionToken?: string
}

export interface PlaceTpSlRequest {
  marketSymbol: string
  side: TradeType
  takeProfitUi?: string   // ≥1 of takeProfitUi / stopLossUi required
  stopLossUi?: string
  sizeAmountUi: string
  owner: string
  signer?: string
  sessionToken?: string
}

export interface EditTriggerOrderRequest {
  marketSymbol: string
  side: TradeType
  orderId: number         // slot 0–4
  isStopLoss: boolean
  triggerPriceUi: string  // BOTH price and size required (no keep-existing)
  sizeAmountUi: string
  owner: string
  signer?: string
  sessionToken?: string
}

export interface CancelTriggerOrderRequest {
  marketSymbol: string
  side: TradeType
  orderId: number         // 0–4, or 255 = cancel ALL triggers for the market
  isStopLoss: boolean
  owner: string
  signer?: string
  sessionToken?: string
}

export interface CancelAllTriggerOrdersRequest {
  marketSymbol: string
  side: TradeType
  owner: string
  signer?: string
  sessionToken?: string
}

export interface CancelLimitOrderRequest {
  marketSymbol: string
  side: TradeType
  orderId: number
  owner: string
  signer?: string
  sessionToken?: string
}

/** Edit a limit order. 0/omitted per field means KEEP EXISTING (opposite of edit-trigger). */
export interface EditLimitOrderRequest {
  marketSymbol: string
  side: TradeType
  orderId: number
  limitPriceUi?: string
  sizeAmountUi?: string
  takeProfitUi?: string
  stopLossUi?: string
  owner: string
  signer?: string
  sessionToken?: string
}

// ── Requests: account setup + withdrawal (BASE chain) ────────────────────────

export interface InitBasketRequest { owner: string }
export interface InitDepositLedgerRequest { owner: string }

/** Hand the basket to the MagicBlock validator. commitFrequency/validator are
 *  protocol-fixed server-side — the request really is just {payer, owner}. */
export interface DelegateBasketRequest {
  payer: string           // pays fees + signs
  owner: string           // whose basket gets delegated
}

/** Move tokens into the vault. NOTE: takes a MINT pubkey, not a symbol. */
export interface DepositDirectRequest {
  owner: string
  tokenMint: string       // mint address (resolve from get_tokens)
  amount: string          // UI units
}

export interface RequestWithdrawalRequest {
  owner: string
  tokenMint: string
  amount: string
  includeCustodySettlement?: boolean  // default true
}

export interface ExecuteWithdrawalRequest {
  owner: string
  tokenMint: string
  includeCustodySettlement?: boolean  // default true
}

// ── Requests: previews (read-only math, no tx) ───────────────────────────────

export interface PreviewLimitOrderFeesRequest {
  marketSymbol: string
  inputAmountUi: string
  outputAmountUi: string
  side: TradeType
  limitPrice?: string
}

export interface PreviewExitFeeRequest {
  marketSymbol: string
  side: TradeType
  closeAmountUsdUi: string
  owner: string
}

export interface PreviewTpSlRequest {
  mode: 'forward' | 'reverse_pnl' | 'reverse_roi'
  marketSymbol: string
  side: TradeType
  owner?: string          // present = use live position; absent = use inline fields
  entryPriceUi?: string
  sizeUsdUi?: string
  collateralUsdUi?: string
  triggerPriceUi?: string
  targetPnlUsdUi?: string
  targetRoiPercent?: number
}

export interface PreviewMarginRequest {
  marketSymbol: string
  side: TradeType
  marginDeltaUsdUi: string
  action: MarginAction
  owner: string
}

// ── Responses ────────────────────────────────────────────────────────────────

export interface TriggerQuote {
  exitPriceUi: string
  profitUsdUi: string
  lossUsdUi: string
  exitFeeUsdUi: string
  receiveUsdUi: string
  pnlPercentage: string
}

/** open-position returns a full quote alongside the optional transaction.
 *  `old*` appear only when increasing an existing position. `swap*` are always
 *  null on V2. The backend also returns discount + max-position-size fields. */
export interface OpenPositionResponse {
  oldLeverage?: string | null
  newLeverage: string
  oldEntryPrice?: string | null
  newEntryPrice: string
  oldLiquidationPrice?: string | null
  newLiquidationPrice: string
  entryFee: string
  entryFeeBeforeDiscount: string
  entryFeeDiscount?: string | null
  discountPercentage?: string | null
  openPositionFeePercent: string
  availableLiquidity: string
  youPayUsdUi: string
  /** API field is genuinely misspelled — matches the backend, do not rename. */
  youRecieveUsdUi: string
  marginFeePercentage: string  // HOURLY borrow rate
  outputAmount: string         // native units
  outputAmountUi: string
  passesMaxPositionSize?: boolean | null
  maxPositionSizeUsd?: string | null
  transactionBase64?: string | null  // present only when `owner` was provided
  swapInPriceUi?: string | null       // always null on V2
  swapOutPriceUi?: string | null      // always null on V2
  swapFeeUsdUi?: string | null        // always null on V2
  takeProfitQuote?: TriggerQuote | null
  stopLossQuote?: TriggerQuote | null
  err?: string | null
}

export interface ClosePositionResponse {
  receiveTokenSymbol: string
  receiveTokenAmountUi: string
  receiveTokenAmountUsdUi: string
  markPrice: string
  entryPrice: string
  existingLiquidationPrice: string
  newLiquidationPrice: string          // "0" on a full close
  existingSize: string
  newSize: string
  existingCollateral: string
  newCollateral: string
  existingLeverage: string
  newLeverage: string
  settledPnl: string                   // signed
  fees: string
  feesBeforeDiscount: string
  lockAndUnsettledFeeUsd?: string | null  // present only on PARTIAL closes
  transactionBase64?: string | null
  err?: string | null
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
  transactionBase64?: string | null
  err?: string | null
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
  transactionBase64?: string | null
  err?: string | null
}

export interface ReversePositionResponse {
  closeReceiveUsd: string
  closeFees: string
  closeSettledPnl: string
  newSide: string                      // "Long" | "Short"
  newLeverage: string
  newEntryPrice: string
  newLiquidationPrice: string
  newSizeUsd: string
  newSizeAmountUi: string
  newCollateralUsd: string             // AFTER the 2% haircut
  openEntryFee: string
  transactionBase64?: string | null
  err?: string | null
}

/** Trigger + limit management, setup, and withdrawal builders return just a tx. */
export interface TxOnlyResponse {
  transactionBase64: string
  err?: string | null
}

export interface PreviewLimitOrderFeesResponse {
  entryPriceUi: string
  entryFeeUsdUi: string
  liquidationPriceUi: string
  borrowRateUi: string
  err?: string | null
}

export interface PreviewExitFeeResponse {
  exitFeeUsdUi: string
  exitFeeAmountUi: string
  exitPriceUi: string
  err?: string | null
}

export interface PreviewTpSlResponse {
  pnlUsdUi?: string | null       // forward mode
  pnlPercentage?: string | null  // forward mode
  triggerPriceUi?: string | null // reverse modes
  err?: string | null
}

export interface PreviewMarginResponse {
  newLeverageUi: string
  newLiquidationPriceUi: string
  maxAmountUsdUi: string
  existingCollateralUsdUi?: string | null
  newCollateralUsdUi?: string | null
  existingLeverageUi?: string | null
  existingLiquidationPriceUi?: string | null
  deltaUsdUi?: string | null
  err?: string | null
}

// ── Reads: owner snapshot, prices, tokens, health, raw accounts ──────────────

export interface OraclePriceRaw {
  price: string
  exponent: number
  confidence: string
  timestamp: string
}

/** Live, enriched metrics for one position (keyed by market pubkey in the snapshot).
 *  NOTE: the indexer pnl/leverage fields here value exits through tradeSpread and
 *  degenerate near liquidation — recompute from mark price for display (see
 *  computePositionView). The raw ...Usd fields are native 6-decimal USD strings. */
export interface PositionMetrics {
  marketSymbol: string
  collateralSymbol: string
  sideUi: string                 // "Long" | "Short"
  entryPriceUi: string
  sizeAmountUi: string
  sizeAmountUiKmb?: string | null
  sizeUsdUi: string
  collateralAmountUi: string
  collateralAmountUiKmb?: string | null
  collateralUsdUi: string
  pnlWithFeeUsdUi: string        // signed — indexer value, spread-distorted
  pnlPercentageWithFee: string
  pnlWithoutFeeUsdUi: string
  pnlPercentageWithoutFee: string
  liquidationPriceUi: string
  leverageUi: string             // may be "Infinity"
  profitUsd: string              // raw 6-dec USD
  lossUsd: string                // raw 6-dec USD
  exitFeeUsd: string             // raw 6-dec USD
  borrowFeeUsd: string           // raw 6-dec USD — cumulative borrow paid
  totalFeeUsd: string            // raw 6-dec USD
  leverage: string               // raw BPS
  marginUsd: string              // raw 6-dec USD
  liquidationPrice: OraclePriceRaw
  exitPrice: OraclePriceRaw
}

export interface TriggerOrderMetrics {
  orderId: number
  type: 'TP' | 'SL'
  triggerPriceUi: string
  sizeAmountUi: string
  sizeUsdUi?: string | null
}

export interface LimitOrderMetrics {
  orderId: number
  limitPriceUi: string
  sizeAmountUi: string
  sizeUsdUi?: string | null
  takeProfitUi?: string | null
  stopLossUi?: string | null
  reserveAmountUi?: string | null
}

export interface OrderMetrics {
  marketSymbol: string
  sideUi: string
  limitOrders: LimitOrderMetrics[]
  takeProfitOrders: TriggerOrderMetrics[]
  stopLossOrders: TriggerOrderMetrics[]
}

/** Everything about one owner in one call — the V2 read model.
 *  `basketPubkey == null` means the account is NOT set up (no basket yet).
 *  positionMetrics / orderMetrics are keyed by MARKET PUBKEY. */
export interface BasketSnapshot {
  owner: string
  basketPubkey?: string | null
  basketData?: string | null   // raw account (base64)
  positionMetrics: Record<string, PositionMetrics>
  orderMetrics: Record<string, OrderMetrics>
}

export interface TokenInfo {
  symbol: string
  /** Live API field is `mint` (the canonical examples-v2 client calls it mintKey — drift). */
  mint: string
  decimals: number
  isStable: boolean
  isVirtual: boolean
  lazerId?: number | null
  pythTicker?: string | null
  isToken2022: boolean
}

export interface PriceInfo {
  price: number
  exponent: number
  confidence: number
  priceUi: number
  timestampUs: number
  marketSession: string   // "regular" | "preMarket" | "postMarket" | "overNight" | "closed"
}

export interface HealthResponse {
  status: string
  program: string          // "ER"
  accounts: Record<string, number>
  config: {
    source: string
    env: string            // "dev" | "prod" (independent of cluster)
    version?: string | null
    branch?: string | null
    publishedAt?: string | null
    builtAt?: number | null
    pools?: number
    markets?: number
    tokens?: number
  }
}

/** Raw Anchor-decoded account wrapper for the /raw/* endpoints. */
export interface RawAccount<T = unknown> {
  pubkey: string
  account: T
}
