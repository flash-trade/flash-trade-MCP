import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FlashApiClient } from '../client/flash-api.ts'
import { txFooter } from './shared/tx.ts'

const pubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)

// The one-time account lifecycle. The API does NOT enforce order — the program
// does. All four steps build BASE-chain transactions.
const ORDER_NOTE =
  'Lifecycle order (one-time per wallet): init_basket → init_deposit_ledger → delegate_basket → deposit_direct. ' +
  'Only after all four can you trade on the Ephemeral Rollup.'

export function registerSetupTools(server: McpServer, client: FlashApiClient) {
  server.registerTool('init_basket', {
    description:
      'STEP 1 of account setup. Build a transaction to create the wallet\'s Basket PDA (holds all positions + orders). ' +
      'Base-chain transaction. ' + ORDER_NOTE,
    inputSchema: { owner: pubkey.describe('Wallet pubkey to create the basket for') },
  }, async ({ owner }) => {
    const res = await client.initBasket({ owner })
    return { content: [{ type: 'text' as const, text: `=== Init Basket (step 1/4) ===\nOwner: ${owner}${txFooter('init-basket', res.transactionBase64)}` }] }
  })

  server.registerTool('init_deposit_ledger', {
    description:
      'STEP 2 of account setup. Build a transaction to create the wallet\'s deposit ledger (collateral inbox). ' +
      'Base-chain transaction. ' + ORDER_NOTE,
    inputSchema: { owner: pubkey.describe('Wallet pubkey to create the deposit ledger for') },
  }, async ({ owner }) => {
    const res = await client.initDepositLedger({ owner })
    return { content: [{ type: 'text' as const, text: `=== Init Deposit Ledger (step 2/4) ===\nOwner: ${owner}${txFooter('init-deposit-ledger', res.transactionBase64)}` }] }
  })

  server.registerTool('delegate_basket', {
    description:
      'STEP 3 of account setup. Build a transaction to delegate the basket to the MagicBlock validator so it can run ' +
      'on the Ephemeral Rollup. The request is only {payer, owner} — commit frequency and validator are protocol-fixed ' +
      'server-side. Base-chain transaction. ' + ORDER_NOTE,
    inputSchema: {
      owner: pubkey.describe('Wallet whose basket gets delegated'),
      payer: pubkey.optional().describe('Fee payer + signer (defaults to owner)'),
    },
  }, async ({ owner, payer }) => {
    const res = await client.delegateBasket({ owner, payer: payer ?? owner })
    return { content: [{ type: 'text' as const, text: `=== Delegate Basket (step 3/4) ===\nOwner: ${owner}\nPayer: ${payer ?? owner}${txFooter('delegate-basket', res.transactionBase64)}` }] }
  })

  server.registerTool('deposit_direct', {
    description:
      'STEP 4 of account setup (and any later top-up). Build a transaction to deposit collateral into the vault. ' +
      'IMPORTANT: takes a token MINT address (not a symbol) — resolve it with get_tokens; an unknown mint silently ' +
      'assumes 6 decimals + legacy SPL, wrong for Token-2022 assets. Base-chain transaction. This moves real funds — ' +
      'only on explicit user approval; never bundle a deposit into other setup steps.',
    inputSchema: {
      owner: pubkey.describe('Wallet making the deposit'),
      token_mint: pubkey.describe('Token MINT address (from get_tokens — NOT the symbol)'),
      amount: z.string().max(32).describe('Amount in UI units, e.g. "15.0"'),
    },
  }, async ({ owner, token_mint, amount }) => {
    const res = await client.depositDirect({ owner, tokenMint: token_mint, amount })
    return { content: [{ type: 'text' as const, text: `=== Deposit ${amount} (step 4/4) ===\nOwner: ${owner}\nMint: ${token_mint}${txFooter('deposit-direct', res.transactionBase64)}` }] }
  })
}
