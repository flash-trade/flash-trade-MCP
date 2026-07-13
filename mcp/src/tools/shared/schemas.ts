// ─────────────────────────────────────────────────────────────────────────────
// schemas.ts — Zod primitives shared across tool input schemas, so the base58
// pubkey charset and the position-side vocabulary each have ONE definition.
// Callers chain .describe()/.optional() as needed; Zod chaining returns a new
// schema, so these shared bases are never mutated.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'

/** Base58 Solana public key — 32–44 chars, excludes 0/O/I/l. */
export const zPubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)

/** Position side / trade direction. */
export const zSide = z.enum(['LONG', 'SHORT'])
