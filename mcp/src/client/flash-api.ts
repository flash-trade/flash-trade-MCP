import type { FlashMcpConfig } from '../config.ts'
import { FlashApiError, FlashApiConnectionError, mapHttpError } from './errors.ts'
import type * as T from './types.ts'

export class FlashApiClient {
  constructor(private readonly config: FlashMcpConfig) {}

  private async request<R>(path: string, init?: RequestInit): Promise<R> {
    const url = `${this.config.apiBaseUrl}${path}`
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: { 'Accept': 'application/json', ...init?.headers },
        ...init,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw mapHttpError(res.status, path, body)
      }
      return (await res.json()) as R
    } catch (e) {
      if (e instanceof FlashApiError) throw e
      throw new FlashApiConnectionError(path, e instanceof Error ? e : new Error(String(e)))
    }
  }

  private get<R>(path: string): Promise<R> {
    return this.request(path)
  }

  private post<R>(path: string, body: unknown): Promise<R> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  // ── Health ──

  async getHealth(): Promise<T.HealthResponse> {
    return this.get('/health')
  }

  // ── Markets ──

  async getMarkets(): Promise<unknown[]> {
    return this.get('/markets')
  }

  async getMarket(pubkey: string): Promise<unknown> {
    return this.get(`/markets/${pubkey}`)
  }

  // ── Pools ──

  async getPools(): Promise<unknown[]> {
    return this.get('/pools')
  }

  async getPool(pubkey: string): Promise<unknown> {
    return this.get(`/pools/${pubkey}`)
  }

  // ── Custodies ──

  async getCustodies(): Promise<unknown[]> {
    return this.get('/custodies')
  }

  async getCustody(pubkey: string): Promise<unknown> {
    return this.get(`/custodies/${pubkey}`)
  }

  // ── Prices ──

  async getPrices(): Promise<Record<string, T.PriceData>> {
    return this.get('/prices')
  }

  async getPrice(symbol: string): Promise<T.PriceData> {
    return this.get(`/prices/${symbol}`)
  }

  // ── Positions ──

  async getPositions(owner?: string): Promise<unknown[]> {
    const query = owner ? `?owner=${owner}` : ''
    return this.get(`/positions${query}`)
  }

  async getPosition(pubkey: string): Promise<unknown> {
    return this.get(`/positions/${pubkey}`)
  }

  async getOwnerPositions(owner: string, includePnlInLeverage = false): Promise<T.EnrichedPosition[]> {
    return this.get(`/positions/owner/${owner}?includePnlInLeverageDisplay=${includePnlInLeverage}`)
  }

  // ── Orders ──

  async getOrders(owner?: string): Promise<unknown[]> {
    const query = owner ? `?owner=${owner}` : ''
    return this.get(`/orders${query}`)
  }

  async getOrder(pubkey: string): Promise<unknown> {
    return this.get(`/orders/${pubkey}`)
  }

  async getOwnerOrders(owner: string): Promise<T.EnrichedOrder[]> {
    return this.get(`/orders/owner/${owner}`)
  }

  // ── Pool Data ──

  async getPoolData(): Promise<unknown[]> {
    return this.get('/pool-data')
  }

  async getPoolSnapshot(poolPubkey: string): Promise<unknown> {
    return this.get(`/pool-data/${poolPubkey}`)
  }

  // ── Transaction Builder ──

  async openPosition(req: T.OpenPositionRequest): Promise<T.OpenPositionResponse> {
    return this.post('/transaction-builder/open-position', req)
  }

  async closePosition(req: T.ClosePositionRequest): Promise<T.ClosePositionResponse> {
    return this.post('/transaction-builder/close-position', req)
  }

  async addCollateral(req: T.AddCollateralRequest): Promise<T.AddCollateralResponse> {
    return this.post('/transaction-builder/add-collateral', req)
  }

  async removeCollateral(req: T.RemoveCollateralRequest): Promise<T.RemoveCollateralResponse> {
    return this.post('/transaction-builder/remove-collateral', req)
  }

  async reversePosition(req: T.ReversePositionRequest): Promise<T.ReversePositionResponse> {
    return this.post('/transaction-builder/reverse-position', req)
  }

  // ── Previews ──

  async previewLimitOrderFees(req: T.PreviewLimitOrderFeesRequest): Promise<T.PreviewLimitOrderFeesResponse> {
    return this.post('/preview/limit-order-fees', req)
  }

  async previewExitFee(req: T.PreviewExitFeeRequest): Promise<T.PreviewExitFeeResponse> {
    return this.post('/preview/exit-fee', req)
  }

  async previewTpSl(req: T.PreviewTpSlRequest): Promise<T.PreviewTpSlResponse> {
    return this.post('/preview/tp-sl', req)
  }

  async previewMargin(req: T.PreviewMarginRequest): Promise<T.PreviewMarginResponse> {
    return this.post('/preview/margin', req)
  }
}
