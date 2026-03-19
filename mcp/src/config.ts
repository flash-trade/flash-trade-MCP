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
  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    timeoutMs: parseInt(process.env.FLASH_API_TIMEOUT ?? '30000', 10),
    walletPubkey: process.env.WALLET_PUBKEY,
  }
}
