import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import fs from 'node:fs'

/** Strip anything that looks like key material from error messages */
function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  // Remove any sequences of numbers that could be key bytes (e.g. [1,2,3,...])
  return msg
    .replace(/\[[\d,\s]{20,}\]/g, '[REDACTED]')
    // Remove hex strings longer than 40 chars that could be key material
    .replace(/[0-9a-fA-F]{40,}/g, '[REDACTED]')
    // Remove base58 strings longer than 40 chars (potential secret keys)
    .replace(/[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{40,}/g, '[REDACTED]')
}

export function registerSignAndSendTool(server: McpServer) {
  server.registerTool('sign_and_send', {
    description:
      'Sign and submit a base64-encoded unsigned Solana transaction using the locally configured keypair. ' +
      'Call this AFTER a transaction tool (open_position, close_position, add_collateral, remove_collateral, reverse_position) ' +
      'returns a transactionBase64 string AND the user has reviewed and approved the preview. ' +
      'The keypair is read from KEYPAIR_PATH (default: ~/.config/solana/id.json). ' +
      'Returns the confirmed transaction signature and a Solscan link. ' +
      'IMPORTANT: Always show the transaction preview to the user and get their approval BEFORE calling this tool. ' +
      'This tool signs with the local keypair and submits to Solana mainnet — the action is IRREVERSIBLE. ' +
      'NOTE: This tool never exposes private key material in its output.',
    inputSchema: {
      transaction_base64: z.string().describe('The base64-encoded unsigned transaction returned by a transaction tool'),
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
      ]
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    } catch (e) {
      return {
        content: [{ type: 'text' as const, text: `Transaction send failed: ${sanitizeError(e)}` }],
        isError: true,
      }
    }
  })
}
