#!/usr/bin/env bun
/**
 * Full live round-trip test: open position → verify → close position
 * Uses real funds on mainnet. Small amounts only.
 */
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import fs from 'node:fs'

const API_URL = process.env.FLASH_API_URL ?? 'https://flash-ui-api-rust.fly.dev'
const RPC_URL = process.env.SOLANA_RPC_URL
  ?? 'https://api.mainnet-beta.solana.com'
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`

// ── Load keypair ──
const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'))
const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData))
const wallet = keypair.publicKey.toBase58()
const connection = new Connection(RPC_URL, 'confirmed')

console.log('=== FLASH TRADE MCP — LIVE ROUND-TRIP TEST ===')
console.log(`Wallet: ${wallet}`)
console.log(`API: ${API_URL}`)
console.log(`RPC: ${RPC_URL.slice(0, 50)}...`)
console.log('')

async function signAndSend(base64Tx: string): Promise<string> {
  const txBytes = Buffer.from(base64Tx, 'base64')
  const tx = VersionedTransaction.deserialize(txBytes)

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  tx.message.recentBlockhash = blockhash
  tx.sign([keypair])

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed')

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
  }

  return signature
}

async function apiPost(path: string, body: object) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error [${res.status}] ${path}: ${text}`)
  }
  return res.json()
}

async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`API error [${res.status}] ${path}`)
  return res.json()
}

try {
  // ── Step 1: Check current positions ──
  console.log('━━━ Step 1: Check existing positions ━━━')
  const existingPositions = await apiGet(`/positions/owner/${wallet}?includePnlInLeverageDisplay=false`) as any[]
  console.log(`  Existing positions: ${existingPositions.length}`)
  if (existingPositions.length > 0) {
    console.log('  WARNING: You have existing positions. Proceeding carefully.')
  }
  console.log('')

  // ── Step 2: Open position (SOL LONG, $5 USDC, 2x) ──
  console.log('━━━ Step 2: Open position (SOL LONG, $5 USDC, 2x leverage) ━━━')
  const openRes = await apiPost('/transaction-builder/open-position', {
    inputTokenSymbol: 'USDC',
    outputTokenSymbol: 'SOL',
    inputAmountUi: '5.0',
    leverage: 2.0,
    tradeType: 'LONG',
    owner: wallet,
    slippagePercentage: '1.0',
  }) as any

  if (openRes.err) {
    console.error(`  API error: ${openRes.err}`)
    process.exit(1)
  }

  console.log(`  Entry Price: $${openRes.newEntryPrice}`)
  console.log(`  Leverage: ${openRes.newLeverage}x`)
  console.log(`  Liq Price: $${openRes.newLiquidationPrice}`)
  console.log(`  Size: $${openRes.youRecieveUsdUi} (${openRes.outputAmountUi} SOL)`)
  console.log(`  Collateral: $${openRes.youPayUsdUi}`)
  console.log(`  Fee: $${openRes.entryFee}`)

  if (!openRes.transactionBase64) {
    console.error('  ERROR: No transaction returned')
    process.exit(1)
  }

  console.log(`  Transaction: ${openRes.transactionBase64.length} chars`)
  console.log('')

  console.log('  Signing and sending...')
  const openSig = await signAndSend(openRes.transactionBase64)
  console.log(`  CONFIRMED: https://solscan.io/tx/${openSig}`)
  console.log('')

  // ── Step 3: Verify position exists ──
  console.log('━━━ Step 3: Verify position opened ━━━')
  // Wait a moment for the API to index the new position
  await new Promise(r => setTimeout(r, 3000))

  const positions = await apiGet(`/positions/owner/${wallet}?includePnlInLeverageDisplay=false`) as any[]
  console.log(`  Positions found: ${positions.length}`)

  const newPos = positions.find((p: any) => p.marketSymbol === 'SOL' && p.sideUi === 'Long')
  if (!newPos) {
    console.error('  ERROR: New SOL LONG position not found!')
    console.log('  Available positions:', positions.map((p: any) => `${p.sideUi} ${p.marketSymbol}`))
    process.exit(1)
  }

  console.log(`  Found: ${newPos.sideUi} ${newPos.marketSymbol}`)
  console.log(`  Key: ${newPos.key}`)
  console.log(`  Size: $${newPos.sizeUsdUi}`)
  console.log(`  Leverage: ${newPos.leverageUi}x`)
  console.log(`  Entry: $${newPos.entryPriceUi}`)
  console.log(`  Liq: $${newPos.liquidationPriceUi}`)
  if (newPos.pnlWithFeeUsdUi) {
    console.log(`  PnL: $${newPos.pnlWithFeeUsdUi}`)
  }
  console.log('')

  // ── Step 4: Close position ──
  console.log('━━━ Step 4: Close position (full) ━━━')
  const closeRes = await apiPost('/transaction-builder/close-position', {
    positionKey: newPos.key,
    inputUsdUi: newPos.sizeUsdUi,
    withdrawTokenSymbol: 'USDC',
    slippagePercentage: '1.0',
  }) as any

  if (closeRes.err) {
    console.error(`  API error: ${closeRes.err}`)
    process.exit(1)
  }

  console.log(`  Receive: ${closeRes.receiveTokenAmountUi} ${closeRes.receiveTokenSymbol} ($${closeRes.receiveTokenAmountUsdUi})`)
  console.log(`  Settled PnL: $${closeRes.settledPnl}`)
  console.log(`  Fees: $${closeRes.fees}`)
  console.log(`  Mark Price: $${closeRes.markPrice}`)

  if (!closeRes.transactionBase64) {
    console.error('  ERROR: No transaction returned')
    process.exit(1)
  }

  console.log(`  Transaction: ${closeRes.transactionBase64.length} chars`)
  console.log('')

  console.log('  Signing and sending...')
  const closeSig = await signAndSend(closeRes.transactionBase64)
  console.log(`  CONFIRMED: https://solscan.io/tx/${closeSig}`)
  console.log('')

  // ── Step 5: Verify position closed ──
  console.log('━━━ Step 5: Verify position closed ━━━')
  await new Promise(r => setTimeout(r, 3000))

  const finalPositions = await apiGet(`/positions/owner/${wallet}?includePnlInLeverageDisplay=false`) as any[]
  const stillOpen = finalPositions.find((p: any) => p.key === newPos.key)

  if (stillOpen) {
    console.log('  WARNING: Position still appears open (may take a moment to index)')
  } else {
    console.log('  Position closed successfully!')
  }

  console.log(`  Remaining positions: ${finalPositions.length}`)
  console.log('')

  // ── Summary ──
  console.log('=== ROUND-TRIP COMPLETE ===')
  console.log(`  Open TX:  https://solscan.io/tx/${openSig}`)
  console.log(`  Close TX: https://solscan.io/tx/${closeSig}`)
  console.log(`  Collateral paid: $${openRes.youPayUsdUi}`)
  console.log(`  Received back: $${closeRes.receiveTokenAmountUsdUi}`)
  console.log(`  Net cost (fees): $${(parseFloat(openRes.entryFee) + parseFloat(closeRes.fees)).toFixed(4)}`)
  console.log('')
  console.log('SUCCESS: Open → Verify → Close round trip completed.')

} catch (err) {
  console.error('FATAL ERROR:', err)
  process.exit(1)
}
