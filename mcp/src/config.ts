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

export function loadConfig(): FlashMcpConfig {
  const apiBaseUrl = process.env.FLASH_API_URL ?? DEFAULTS.apiBaseUrl

  let parsed: URL
  try {
    parsed = new URL(apiBaseUrl)
  } catch {
    throw new Error(`FLASH_API_URL is not a valid URL: ${apiBaseUrl}`)
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    console.error(`[flash-trade-mcp] WARNING: FLASH_API_URL uses ${parsed.protocol} — HTTPS is strongly recommended for production`)
  }

  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    erRpcUrl: (process.env.ER_RPC_URL ?? DEFAULTS.erRpcUrl).replace(/\/$/, ''),
    baseRpcUrl: (process.env.SOLANA_RPC_URL ?? DEFAULTS.baseRpcUrl).replace(/\/$/, ''),
    timeoutMs: parseInt(process.env.FLASH_API_TIMEOUT ?? String(DEFAULTS.timeoutMs), 10),
    walletPubkey: process.env.WALLET_PUBKEY,
    keypairPath: process.env.KEYPAIR_PATH ?? (home ? `${home}/.config/solana/id.json` : '.config/solana/id.json'),
  }
}
