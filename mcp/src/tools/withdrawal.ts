import { z } from 'zod'
import { zPubkey } from './shared/schemas.ts'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'

const pubkey = zPubkey

export function registerWithdrawalTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('request_withdrawal', {
    description:
      'STEP 1 of withdrawal (two approvals by design). Build a transaction to escrow funds and schedule settlement ' +
      'off the Ephemeral Rollup. Takes a token MINT (from get_tokens), not a symbol. Base-chain transaction. ' +
      'After this confirms, wait ~30–90s for settlement to cross, then call execute_withdrawal.',
    inputSchema: {
      owner: pubkey.describe('Wallet withdrawing'),
      token_mint: pubkey.describe('Token MINT address (from get_tokens — NOT the symbol)'),
      amount: z.string().max(32).describe('Amount to withdraw in UI units, e.g. "1.0"'),
    },
  }, async ({ owner, token_mint, amount }) => {
    const res = await client.requestWithdrawal({ owner, tokenMint: token_mint, amount })
    return { content: [{ type: 'text' as const, text: `=== Request Withdrawal ${amount} (step 1/2) ===\nOwner: ${owner}\nMint: ${token_mint}${txFooter('request-withdrawal', res.transactionBase64)}\n\nNext: after ~30–90s, call execute_withdrawal for the same mint.` }] }
  })

  server.registerTool('execute_withdrawal', {
    description:
      'STEP 2 of withdrawal. Build a transaction to move the settled funds to the wallet. Base-chain transaction. ' +
      'If it fails with 0xbc4 / AccountNotInitialized(settlement_receipt), settlement has NOT crossed yet — this is a ' +
      'TIMING state (~30–90s after request_withdrawal), not a failure. Wait and re-call; execute can be safely retried. ' +
      'NOTE: this endpoint may return 404 on some deployments where it is not yet live (see V2-ALIGNMENT.md).',
    inputSchema: {
      owner: pubkey.describe('Wallet withdrawing'),
      token_mint: pubkey.describe('Token MINT address (same mint as request_withdrawal)'),
    },
  }, async ({ owner, token_mint }) => {
    const res = await client.executeWithdrawal({ owner, tokenMint: token_mint })
    return { content: [{ type: 'text' as const, text: `=== Execute Withdrawal (step 2/2) ===\nOwner: ${owner}\nMint: ${token_mint}${txFooter('execute-withdrawal', res.transactionBase64)}` }] }
  })
}
