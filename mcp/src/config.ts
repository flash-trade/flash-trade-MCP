// ─────────────────────────────────────────────────────────────────────────────
// config.ts — resolve the Flash V2 network from the environment.
// V2 spans TWO chains: trading txs go to the Ephemeral Rollup RPC, setup +
// withdrawal txs go to the base-chain Solana RPC. The API base is a THIRD
// endpoint (the hosted REST builder). All three are carried side-by-side so a
// caller can never lose track of which chain a built transaction belongs to.
// ─────────────────────────────────────────────────────────────────────────────

/** Verified-working defaults (probed live 2026-07-13). */
export const DEFAULTS = {
  /** Hosted V2 REST base. The live app serves the V2 surface at ROOT — the
   *  documented `/v2` edge prefix is not deployed. Operators fronting the app
   *  with that edge set FLASH_API_URL=https://flashapi.trade/v2. */
  apiBaseUrl: 'https://flashapi.trade',
  /** Ephemeral Rollup RPC — TRADING txs (open/close/collateral/triggers/limits). */
  erRpcUrl: 'https://flash.magicblock.xyz',
  /** Base-chain Solana RPC — SETUP + WITHDRAWAL txs. */
  baseRpcUrl: 'https://api.mainnet-beta.solana.com',
  timeoutMs: 30000,
} as const

export interface FlashMcpConfig {
  /** REST base for the hosted transaction builder + reads (no trailing slash). */
  apiBaseUrl: string
  /** RPC for submitting TRADING transactions (ER). */
  erRpcUrl: string
  /** RPC for submitting SETUP + WITHDRAWAL transactions (base chain). */
  baseRpcUrl: string
  timeoutMs: number
  /** Optional default owner pubkey for tools that accept one. */
  walletPubkey?: string
  /** Keypair path used by sign_and_send (default ~/.config/solana/id.json). */
  keypairPath: string
}

/**
 * Resolve an endpoint URL and ENFORCE https:// (localhost/127.0.0.1 exempt for
 * local dev). Plaintext is rejected, not merely warned: over http a network
 * attacker can substitute the very transaction sign_and_send will sign, so the
 * whole trust model collapses. Returns the URL with any trailing slash removed.
 */
function resolveEndpoint(name: string, value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`)
  }
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && !isLoopback) {
    throw new Error(
      `${name} must use https:// (got "${parsed.protocol}//"). Plaintext endpoints let a network ` +
        `attacker substitute the transaction you sign. Only localhost/127.0.0.1 are exempt.`,
    )
  }
  return value.replace(/\/$/, '')
}

export function loadConfig(): FlashMcpConfig {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''

  // Timeout: guard against a non-numeric FLASH_API_TIMEOUT, which would otherwise
  // become AbortSignal.timeout(NaN) and abort every request instantly.
  const timeoutRaw = process.env.FLASH_API_TIMEOUT
  const timeoutNum = timeoutRaw !== undefined ? Number(timeoutRaw) : NaN
  const timeoutMs = Number.isFinite(timeoutNum) && timeoutNum > 0 ? timeoutNum : DEFAULTS.timeoutMs

  return {
    apiBaseUrl: resolveEndpoint('FLASH_API_URL', process.env.FLASH_API_URL ?? DEFAULTS.apiBaseUrl),
    erRpcUrl: resolveEndpoint('ER_RPC_URL', process.env.ER_RPC_URL ?? DEFAULTS.erRpcUrl),
    baseRpcUrl: resolveEndpoint('SOLANA_RPC_URL', process.env.SOLANA_RPC_URL ?? DEFAULTS.baseRpcUrl),
    timeoutMs,
    walletPubkey: process.env.WALLET_PUBKEY,
    keypairPath: process.env.KEYPAIR_PATH ?? (home ? `${home}/.config/solana/id.json` : '.config/solana/id.json'),
  }
}
