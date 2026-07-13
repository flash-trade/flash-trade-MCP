import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import fs from 'node:fs'
import type { FlashMcpConfig } from '../config.ts'
import { sanitizeError } from '../sanitize.ts'

/**
 * Poll-based confirmation. V2 spans two chains; polling getSignatureStatuses
 * works identically on the Ephemeral Rollup and the base chain (confirmTransaction
 * assumes base-chain blockhash semantics). Returns the confirmed signature.
 */
async function sendAndConfirm(connection: Connection, tx: VersionedTransaction, timeoutMs: number): Promise<string> {
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
  const started = Date.now()
  let polls = 0
  for (;;) {
    const status = (await connection.getSignatureStatuses([signature])).value[0]
    if (status) {
      if (status.err) throw new Error(`on-chain error: ${JSON.stringify(status.err)} (${signature})`)
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return signature
    }
    if (Date.now() - started > timeoutMs) throw new Error(`confirmation timeout after ${timeoutMs}ms (sent ${signature})`)
    polls += 1
    await new Promise((r) => setTimeout(r, polls <= 10 ? 30 : 150))
  }
}

export function registerSignAndSendTool(server: McpServer, config: FlashMcpConfig) {
  server.registerTool('sign_and_send', {
    description:
      'Sign a base64 transaction with the local keypair and submit it to the correct chain. ' +
      'The `network` argument is REQUIRED and MUST match the chain the transaction was built for — every transaction ' +
      'tool tells you which value to pass ("er" for trading, "base" for setup/withdrawal). Submitting to the wrong ' +
      'chain fails to land. Call ONLY after showing the preview and getting user approval, and call promptly — ' +
      'blockhashes expire in ~60s. IRREVERSIBLE. Returns the confirmed signature.',
    inputSchema: {
      transaction_base64: z.string().max(20000).describe('The unsigned base64 transaction from a transaction tool'),
      network: z.enum(['er', 'base']).describe('Which chain to submit on — "er" (trading) or "base" (setup/withdrawal). Use the exact value the transaction tool told you.'),
    },
  }, async ({ transaction_base64, network }) => {
    const rpcUrl = network === 'er' ? config.erRpcUrl : config.baseRpcUrl
    const keypairPath = config.keypairPath

    // Load keypair — all errors sanitized to prevent key leakage.
    let keypair: Keypair
    try {
      const raw = fs.readFileSync(keypairPath, 'utf-8')
      let bytes: number[]
      try {
        bytes = JSON.parse(raw)
      } catch {
        return { content: [{ type: 'text' as const, text: `Keypair file at ${keypairPath} is not valid JSON.` }], isError: true }
      }
      if (!Array.isArray(bytes) || bytes.length !== 64) {
        return { content: [{ type: 'text' as const, text: `Keypair file at ${keypairPath} is not a valid 64-byte Solana keypair.` }], isError: true }
      }
      keypair = Keypair.fromSecretKey(Uint8Array.from(bytes))
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Failed to load keypair from ${keypairPath}: ${sanitizeError(e)}` }], isError: true }
    }

    // Decode + sign. V2 txs are PARTIALLY SIGNED — the server pre-filled its
    // signer slots and chose the blockhash. We add ONLY the owner signature and
    // NEVER replace the blockhash (that would invalidate the server's signatures).
    let tx: VersionedTransaction
    try {
      tx = VersionedTransaction.deserialize(Buffer.from(transaction_base64, 'base64'))
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Failed to decode transaction: ${sanitizeError(e)}` }], isError: true }
    }
    tx.sign([keypair])

    const connection = new Connection(rpcUrl, 'confirmed')
    try {
      const signature = await sendAndConfirm(connection, tx, config.timeoutMs)
      const chainLabel = network === 'er' ? 'Ephemeral Rollup' : 'base chain'
      const lines = [
        '=== Transaction Confirmed ===',
        `Chain: ${chainLabel} (${rpcUrl})`,
        `Signature: ${signature}`,
      ]
      if (network === 'base') lines.push(`Explorer: https://solscan.io/tx/${signature}`)
      lines.push('', 'Next: call get_owner / get_account_summary (with owner) to verify the result.')
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    } catch (e) {
      const msg = sanitizeError(e)
      let hint = ''
      if (/AccountNotInitialized|0xbc4|settlement_receipt/i.test(msg)) {
        hint = '\n\nThis is 0xbc4 / AccountNotInitialized(settlement_receipt) — settlement has NOT crossed from the rollup yet. This is a TIMING state, not a failure: wait ~30–90s after request_withdrawal, then re-call execute_withdrawal + sign_and_send. Execute is safely retryable.'
      } else if (/Blockhash not found|block height exceeded/i.test(msg)) {
        hint = '\n\nThe blockhash expired (~60s). Re-call the original transaction tool for a fresh transaction, then sign_and_send immediately.'
      } else if (/Cannot sign with non signer key/i.test(msg)) {
        hint = '\n\nThe transaction was built for a different wallet than the local keypair. Re-build it with the matching owner, then sign immediately.'
      } else if (/on-chain error/i.test(msg)) {
        hint = `\n\nDouble-check you passed the correct network ("${network}") — a trading tx submitted to base (or vice-versa) fails here.`
      }
      return { content: [{ type: 'text' as const, text: `Transaction send failed on ${network}: ${msg}${hint}` }], isError: true }
    }
  })
}
