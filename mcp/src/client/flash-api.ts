// ─────────────────────────────────────────────────────────────────────────────
// flash-api.ts — thin typed client for the hosted Flash V2 (MagicBlock ER) API.
// The entire REST surface (reads + transaction builders + previews) funnels
// through one request() that normalizes the API's four error channels and
// throws `err`-in-a-200 for you. Transaction builders return PARTIALLY-SIGNED
// base64 txs — the server pre-filled its signer slots and chose the blockhash
// for the right chain; the caller adds only the owner signature and submits to
// the chain named in network.ts (TX_CHAIN). This client never signs or submits.
// ─────────────────────────────────────────────────────────────────────────────

import { FlashApiError, FlashApiConnectionError, mapHttpError, assertNoErr } from './errors.ts'
import type * as T from './types.ts'

/** The client needs only the REST base + timeout; the full FlashMcpConfig
 *  (which carries RPC URLs + keypair path for sign_and_send) satisfies this. */
export interface FlashApiClientConfig {
  apiBaseUrl: string
  timeoutMs: number
}

export class FlashApiClient {
  constructor(private readonly config: FlashApiClientConfig) {}

  /** REST base (root, no trailing slash) this client targets. */
  get apiBaseUrl(): string {
    return this.config.apiBaseUrl
  }

  private async request<R>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<R> {
    const url = `${this.config.apiBaseUrl}${path}`
    let res: Response
    try {
      res = await fetch(url, {
        method,
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      throw new FlashApiConnectionError(path, e instanceof Error ? e : new Error(String(e)))
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw mapHttpError(res.status, path, text)
    }

    const json = (await res.json().catch(() => ({}))) as R
    // Trading + preview endpoints report failure as `err` inside a 200 body.
    return assertNoErr(path, json as R & { err?: string | null })
  }

  private get<R>(path: string): Promise<R> {
    return this.request<R>('GET', path)
  }

  private post<R>(path: string, body: unknown): Promise<R> {
    return this.request<R>('POST', path, body)
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Service health + live pool-config provenance (env/version/account counts). */
  getHealth(): Promise<T.HealthResponse> {
    return this.get('/health')
  }

  /** Token metadata for the active pool — symbols, MINTS (for deposits), decimals, isToken2022. */
  getTokens(): Promise<T.TokenInfo[]> {
    return this.get('/tokens')
  }

  /** All live oracle prices for the active pool, keyed by symbol. */
  getPrices(): Promise<Record<string, T.PriceInfo>> {
    return this.get('/prices')
  }

  /** One symbol's live price (case-insensitive). 404 if not in the active pool. */
  getPrice(symbol: string): Promise<T.PriceInfo> {
    return this.get(`/prices/${encodeURIComponent(symbol)}`)
  }

  /** Aggregated pool stats (TVL, utilization, LP price). */
  getPoolData(): Promise<unknown> {
    return this.get('/pool-data')
  }

  /** Pool stats for one pool pubkey. */
  getPoolDataByPool(poolPubkey: string): Promise<unknown> {
    return this.get(`/pool-data/${encodeURIComponent(poolPubkey)}`)
  }

  /** Raw Anchor-decoded accounts. */
  getMarkets(): Promise<T.RawAccount[]> {
    return this.get('/raw/markets')
  }
  getMarket(pubkey: string): Promise<T.RawAccount> {
    return this.get(`/raw/markets/${encodeURIComponent(pubkey)}`)
  }
  getPools(): Promise<T.RawAccount[]> {
    return this.get('/raw/pools')
  }
  getPool(pubkey: string): Promise<T.RawAccount> {
    return this.get(`/raw/pools/${encodeURIComponent(pubkey)}`)
  }
  getCustodies(): Promise<T.RawAccount[]> {
    return this.get('/raw/custodies')
  }
  getCustody(pubkey: string): Promise<T.RawAccount> {
    return this.get(`/raw/custodies/${encodeURIComponent(pubkey)}`)
  }
  /** NOTE: takes the BASKET PDA (from getOwner().basketPubkey), not the owner. */
  getBasket(basketPubkey: string): Promise<T.RawAccount> {
    return this.get(`/raw/baskets/${encodeURIComponent(basketPubkey)}`)
  }

  /**
   * THE read model: everything about one owner in one call — basket PDA, raw
   * basket bytes, and pre-enriched position/order metrics (keyed by market pubkey).
   * `basketPubkey == null` means the account is not set up yet.
   */
  getOwner(owner: string): Promise<T.BasketSnapshot> {
    return this.get(`/owner/${encodeURIComponent(owner)}`)
  }

  // ── Account setup (build unsigned tx → submit to BASE chain) ─────────────────

  initBasket(req: T.InitBasketRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/init-basket', req)
  }
  initDepositLedger(req: T.InitDepositLedgerRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/init-deposit-ledger', req)
  }
  delegateBasket(req: T.DelegateBasketRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/delegate-basket', req)
  }
  depositDirect(req: T.DepositDirectRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/deposit-direct', req)
  }

  // ── Trading (build unsigned tx → submit to the ER) ──────────────────────────

  openPosition(req: T.OpenPositionRequest): Promise<T.OpenPositionResponse> {
    return this.post('/transaction-builder/open-position', req)
  }
  closePosition(req: T.ClosePositionRequest): Promise<T.ClosePositionResponse> {
    return this.post('/transaction-builder/close-position', req)
  }
  reversePosition(req: T.ReversePositionRequest): Promise<T.ReversePositionResponse> {
    return this.post('/transaction-builder/reverse-position', req)
  }
  addCollateral(req: T.AddCollateralRequest): Promise<T.AddCollateralResponse> {
    return this.post('/transaction-builder/add-collateral', req)
  }
  removeCollateral(req: T.RemoveCollateralRequest): Promise<T.RemoveCollateralResponse> {
    return this.post('/transaction-builder/remove-collateral', req)
  }
  placeTpSl(req: T.PlaceTpSlRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/place-tp-sl', req)
  }
  placeTriggerOrder(req: T.PlaceTriggerOrderRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/place-trigger-order', req)
  }
  editTriggerOrder(req: T.EditTriggerOrderRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/edit-trigger-order', req)
  }
  cancelTriggerOrder(req: T.CancelTriggerOrderRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/cancel-trigger-order', req)
  }
  cancelAllTriggerOrders(req: T.CancelAllTriggerOrdersRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/cancel-all-trigger-orders', req)
  }
  editLimitOrder(req: T.EditLimitOrderRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/edit-limit-order', req)
  }
  cancelLimitOrder(req: T.CancelLimitOrderRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/cancel-limit-order', req)
  }

  // ── Withdrawal (build unsigned tx → submit to BASE chain) ────────────────────

  requestWithdrawal(req: T.RequestWithdrawalRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/request-withdrawal', req)
  }
  executeWithdrawal(req: T.ExecuteWithdrawalRequest): Promise<T.TxOnlyResponse> {
    return this.post('/transaction-builder/execute-withdrawal', req)
  }

  // ── Previews (read-only math; no tx) ────────────────────────────────────────

  previewLimitOrderFees(req: T.PreviewLimitOrderFeesRequest): Promise<T.PreviewLimitOrderFeesResponse> {
    return this.post('/preview/limit-order-fees', req)
  }
  previewExitFee(req: T.PreviewExitFeeRequest): Promise<T.PreviewExitFeeResponse> {
    return this.post('/preview/exit-fee', req)
  }
  previewTpSl(req: T.PreviewTpSlRequest): Promise<T.PreviewTpSlResponse> {
    return this.post('/preview/tp-sl', req)
  }
  previewMargin(req: T.PreviewMarginRequest): Promise<T.PreviewMarginResponse> {
    return this.post('/preview/margin', req)
  }
}

export { FlashApiError, FlashApiConnectionError }
