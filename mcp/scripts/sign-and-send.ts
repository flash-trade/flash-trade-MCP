#!/usr/bin/env bun
/**
 * Sign and send a base64-encoded unsigned VersionedTransaction from the Flash Trade API.
 * Usage: bun scripts/sign-and-send.ts <base64_transaction>
 */
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import fs from 'node:fs'

const RPC_URL = process.env.SOLANA_RPC_URL
  ?? 'https://api.mainnet-beta.solana.com'
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`

const base64Tx = process.argv[2]
if (!base64Tx) {
  console.error('Usage: bun scripts/sign-and-send.ts <base64_transaction>')
  process.exit(1)
}

// Load keypair
const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'))
const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData))
console.log(`Wallet: ${keypair.publicKey.toBase58()}`)

// Decode transaction
const txBytes = Buffer.from(base64Tx, 'base64')
const tx = VersionedTransaction.deserialize(txBytes)
console.log(`Transaction decoded: ${tx.message.compiledInstructions.length} instruction(s)`)

// Do NOT replace the blockhash — the API's additional signer already signed with it.
// Replacing it would invalidate their pre-signature and cause verification failure.
const connection = new Connection(RPC_URL, 'confirmed')
console.log(`Blockhash (from API): ${tx.message.recentBlockhash.slice(0, 16)}...`)

// Sign with user keypair only (API co-signature is already present)
tx.sign([keypair])
console.log('Transaction signed (preserving API co-signature).')

// Send
console.log('Sending transaction...')
const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: 'confirmed',
})
console.log(`Signature: ${signature}`)

// Confirm
console.log('Confirming...')
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
const confirmation = await connection.confirmTransaction({
  signature,
  blockhash,
  lastValidBlockHeight,
}, 'confirmed')

if (confirmation.value.err) {
  console.error('Transaction FAILED:', confirmation.value.err)
  process.exit(1)
}

console.log(`CONFIRMED: https://solscan.io/tx/${signature}`)
