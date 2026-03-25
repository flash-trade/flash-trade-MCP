export interface FlashMcpConfig {
  apiBaseUrl: string
  timeoutMs: number
  walletPubkey?: string
}

export function loadConfig(): FlashMcpConfig {
  const apiBaseUrl = process.env.FLASH_API_URL
  if (!apiBaseUrl) {
    throw new Error('FLASH_API_URL environment variable is required')
  }

  let parsed: URL
  try {
    parsed = new URL(apiBaseUrl)
  } catch {
    throw new Error(`FLASH_API_URL is not a valid URL: ${apiBaseUrl}`)
  }
  if (parsed.protocol !== 'https:') {
    console.error(`[flash-trade-mcp] WARNING: FLASH_API_URL uses ${parsed.protocol} — HTTPS is strongly recommended for production`)
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    timeoutMs: parseInt(process.env.FLASH_API_TIMEOUT ?? '30000', 10),
    walletPubkey: process.env.WALLET_PUBKEY,
  }
}
