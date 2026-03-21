import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import fs from 'node:fs'

export function registerSignAndSendTool(server: McpServer) {
  server.registerTool('sign_and_send', {
    description:
      'Sign and submit a base64-encoded unsigned Solana transaction using the locally configured keypair. ' +
      'Call this AFTER a transaction tool (open_position, close_position, add_collateral, remove_collateral, reverse_position) ' +
      'returns a transactionBase64 string AND the user has reviewed and approved the preview. ' +
      'The keypair is read from KEYPAIR_PATH (default: ~/.config/solana/id.json). ' +
      'Returns the confirmed transaction signature and a Solscan link. ' +
      'IMPORTANT: Always show the transaction preview to the user and get their approval BEFORE calling this tool. ' +
      'This tool signs with the local keypair and submits to Solana mainnet — the action is IRREVERSIBLE.',
    inputSchema: {
      transaction_base64: z.string().describe('The base64-encoded unsigned transaction returned by a transaction tool'),
    },
  }, async (params) => {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
    const keypairPath = process.env.KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`

    // Load keypair
    let keypair: Keypair
    try {
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))
      keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        content: [{ type: 'text' as const, text: `Failed to load keypair from ${keypairPath}: ${msg}` }],
        isError: true,
      }
    }

    // Decode transaction
    let tx: VersionedTransaction
    try {
      const txBytes = Buffer.from(params.transaction_base64, 'base64')
      tx = VersionedTransaction.deserialize(txBytes)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        content: [{ type: 'text' as const, text: `Failed to decode transaction: ${msg}` }],
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
        `Wallet: ${keypair.publicKey.toBase58()}`,
        `Explorer: https://solscan.io/tx/${signature}`,
      ]
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        content: [{ type: 'text' as const, text: `Transaction send failed: ${msg}` }],
        isError: true,
      }
    }
  })
}
