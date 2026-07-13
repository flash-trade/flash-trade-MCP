import { z } from 'zod'

/**
 * Boolean schema that handles string "true"/"false" from MCP clients.
 * z.coerce.boolean() is BROKEN for this — Boolean("false") === true in JS.
 */
export const zBool = z.preprocess((v) => {
  if (typeof v === 'string') return v === 'true'
  return v
}, z.boolean())

/** Strip anything that looks like key material from error messages */
export function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return (
    msg
      // Keyword-tagged credentials, incl. SHORT ones the length rules below miss:
      // api-key=..., token: ..., Authorization: Bearer ..., ?secret=..., password=...
      .replace(/(api[-_]?key|access[-_]?token|token|secret|password|bearer)([=:]\s*|\s+)[^\s"'&]+/gi, '$1$2[REDACTED]')
      // Any sequences of numbers that could be key bytes (e.g. [1,2,3,...])
      .replace(/\[[\d,\s]{20,}\]/g, '[REDACTED]')
      // Hex strings longer than 40 chars that could be key material
      .replace(/[0-9a-fA-F]{40,}/g, '[REDACTED]')
      // Base58 strings longer than 40 chars (potential secret keys)
      .replace(/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{40,}/g, '[REDACTED]')
      // Base64 strings longer than 40 chars (potential encoded key material)
      .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[REDACTED]')
  )
}
