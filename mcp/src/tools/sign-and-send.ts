import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import fs from 'node:fs'
import { sanitizeError } from '../sanitize.ts'

export function registerSignAndSendTool(server: McpServer) {
  server.registerTool('sign_and_send', {
    description:
      'Sign and submit a base64 transaction to Solana mainnet using the local keypair. ' +
      'Call ONLY after a transaction tool returns transactionBase64 AND the user has approved the preview. ' +
      'IRREVERSIBLE — always confirm with user first. Call immediately — blockhashes expire in ~60 seconds. ' +
      'Returns the confirmed signature and a Solscan link.',
    inputSchema: {
      transaction_base64: z.string().max(10000).describe('The base64-encoded unsigned transaction returned by a transaction tool'),
    },
  }, async (params) => {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
    const keypairPath = process.env.KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`

    // Load keypair — all errors sanitized to prevent key leakage
    let keypair: Keypair
    try {
      const raw = fs.readFileSync(keypairPath, 'utf-8')
      let keypairData: number[]
      try {
        keypairData = JSON.parse(raw)
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Keypair file at ${keypairPath} is not valid JSON.` }],
          isError: true,
        }
      }
      if (!Array.isArray(keypairData) || keypairData.length !== 64) {
        return {
          content: [{ type: 'text' as const, text: `Keypair file at ${keypairPath} does not contain a valid 64-byte Solana keypair.` }],
          isError: true,
        }
      }
      keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData))
    } catch (e) {
      return {
        content: [{ type: 'text' as const, text: `Failed to load keypair from ${keypairPath}: ${sanitizeError(e)}` }],
        isError: true,
      }
    }

    // Decode transaction
    let tx: VersionedTransaction
    try {
      const txBytes = Buffer.from(params.transaction_base64, 'base64')
      tx = VersionedTransaction.deserialize(txBytes)
    } catch (e) {
      return {
        content: [{ type: 'text' as const, text: `Failed to decode transaction: ${sanitizeError(e)}` }],
        isError: true,
      }
    }

    // Sign — do NOT replace the blockhash, the API's co-signer already signed with it
    tx.sign([keypair])

    // Send and confirm
    const connection = new Connection(rpcUrl, 'confirmed')
    try {
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed')

      if (confirmation.value.err) {
        return {
          content: [{ type: 'text' as const, text: `Transaction FAILED on-chain: ${JSON.stringify(confirmation.value.err)}\nSignature: ${signature}` }],
          isError: true,
        }
      }

      const lines = [
        '=== Transaction Confirmed ===',
        `Signature: ${signature}`,
        `Explorer: https://solscan.io/tx/${signature}`,
        '',
        'Next: Call get_positions (with owner) to verify the position, or get_orders to check trigger orders.',
      ]
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    } catch (e) {
      const msg = sanitizeError(e)
      const isBlockhashExpired = msg.includes('Blockhash not found') || msg.includes('block height exceeded')
      const isSignerMismatch = msg.includes('Cannot sign with non signer key')
      let hint = ''
      if (isBlockhashExpired) {
        hint = '\n\nThe blockhash has expired (~60 seconds). Re-call the original transaction tool to get a fresh transaction, then call sign_and_send immediately.'
      } else if (isSignerMismatch) {
        hint = '\n\nThe transaction was built for a different wallet than the local keypair. Re-call the transaction tool to get a fresh transaction, then sign immediately — blockhashes expire in ~60 seconds.'
      }
      return {
        content: [{ type: 'text' as const, text: `Transaction send failed: ${msg}${hint}` }],
        isError: true,
      }
    }
  })
}
