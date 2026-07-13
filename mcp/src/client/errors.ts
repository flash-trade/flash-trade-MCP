// ─────────────────────────────────────────────────────────────────────────────
// errors.ts — ONE error type for the V2 API's FOUR error channels.
// The hosted API reports failure four different ways:
//   1. HTTP 200 with a non-null `err` field   (trading / preview logic failures)
//   2. HTTP 400 with a plain-text body         (trigger / limit PRICE validation)
//   3. HTTP 422 with a plain-text body         (request SCHEMA validation — serde)
//   4. HTTP 500 with an EMPTY body             (setup / withdrawal — reason server-side)
// Everything else (404/405/429/503/network) is `http-other`. This module
// normalizes all of them into FlashApiError with an actionable hint, and
// throws `err`-in-a-200 for you (the single most-missed check on this API).
// ─────────────────────────────────────────────────────────────────────────────

/** Which of the API's error styles produced this error. */
export type ErrorChannel =
  | 'body-err'   // HTTP 200, JSON body carried `err: "..."` (trading / previews)
  | 'http-400'   // HTTP 400, plain-text reason (trigger / limit price validation)
  | 'http-422'   // HTTP 422, plain-text reason (request schema / missing field)
  | 'http-500'   // HTTP 500, empty body (setup / withdrawal — reason server-side only)
  | 'http-other' // 404/405/429/503, network failures

/** Normalized Flash V2 API error. `channel` tells you which style the API used. */
export class FlashApiError extends Error {
  readonly channel: ErrorChannel
  readonly status: number | undefined
  readonly endpoint: string
  /** A next-step suggestion appropriate to the channel. */
  readonly hint: string

  constructor(opts: { channel: ErrorChannel; endpoint: string; message: string; status?: number }) {
    const hint = hintFor(opts.channel)
    super(`[${opts.channel}] ${opts.endpoint}: ${opts.message}${hint ? ` — ${hint}` : ''}`)
    this.name = 'FlashApiError'
    this.channel = opts.channel
    this.endpoint = opts.endpoint
    this.status = opts.status
    this.hint = hint
  }
}

/** Raised when the request never reached the API (DNS/TLS/timeout/offline). */
export class FlashApiConnectionError extends Error {
  readonly endpoint: string
  constructor(endpoint: string, cause: Error) {
    super(`Failed to reach Flash API at ${endpoint}: ${cause.message}`, { cause })
    this.name = 'FlashApiConnectionError'
    this.endpoint = endpoint
  }
}

function hintFor(channel: ErrorChannel): string {
  switch (channel) {
    case 'body-err':
      return 'the API accepted the request but the operation failed — read the reason above'
    case 'http-400':
      return 'a trigger/limit price is invalid vs the live oracle (LONG: limit/SL below mark, TP above; SHORT mirrored)'
    case 'http-422':
      return 'the request is missing or malformed a required field — check parameter names, mint-vs-symbol, and value formats'
    case 'http-500':
      return 'setup/withdrawal server error (reason is server-side only) — verify the token MINT (not symbol), lifecycle order (init-basket → init-deposit-ledger → delegate-basket → deposit), and pool match'
    case 'http-other':
      return ''
  }
}

/**
 * Map a non-2xx HTTP response to a FlashApiError by channel.
 * @param body the response body text (already read)
 */
export function mapHttpError(status: number, endpoint: string, body: string): FlashApiError {
  const text = body.trim()
  if (status === 400) {
    return new FlashApiError({ channel: 'http-400', endpoint, status, message: text || 'bad request' })
  }
  if (status === 422) {
    return new FlashApiError({ channel: 'http-422', endpoint, status, message: text || 'unprocessable entity (schema validation)' })
  }
  if (status === 500) {
    return new FlashApiError({ channel: 'http-500', endpoint, status, message: text || 'empty 500 — server logs only' })
  }
  const known: Record<number, string> = {
    404: 'route not found (endpoint may not be deployed on this API)',
    405: 'method not allowed',
    429: 'rate limited — retry shortly',
    503: 'API temporarily unavailable',
  }
  return new FlashApiError({ channel: 'http-other', endpoint, status, message: text || known[status] || `HTTP ${status}` })
}

/**
 * Throw if a 200-OK trading/preview response actually carried an `err`.
 * The single most-missed check on this API: `err` arrives WITH HTTP 200.
 */
export function assertNoErr<T extends { err?: string | null }>(endpoint: string, body: T): T {
  if (body && body.err) {
    throw new FlashApiError({ channel: 'body-err', endpoint, status: 200, message: body.err })
  }
  return body
}
