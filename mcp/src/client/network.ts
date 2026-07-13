// ─────────────────────────────────────────────────────────────────────────────
// network.ts — the two-chain routing table. THE single source of truth for
// which chain each transaction-builder endpoint targets. A V2 tx is built
// against one chain's blockhash and MUST be submitted to that chain; mixing
// them fails to land. Every tx tool reads this map; the routing unit tests
// assert it. If a new builder endpoint is added, add it here or the build breaks.
// ─────────────────────────────────────────────────────────────────────────────

/** Which chain a built transaction must be submitted to. */
export type Chain = 'er' | 'base'

/**
 * Endpoint class → chain. Keys are the transaction-builder path segments.
 * - `er`   → Ephemeral Rollup (trading): open/close/collateral/triggers/limits
 * - `base` → base-chain Solana (setup + withdrawal)
 * Source: examples-v2 lifecycle.ts chain map + client.ts per-method TSDoc.
 */
export const TX_CHAIN = {
  // Trading — Ephemeral Rollup
  'open-position': 'er',
  'close-position': 'er',
  'reverse-position': 'er',
  'add-collateral': 'er',
  'remove-collateral': 'er',
  'place-tp-sl': 'er',
  'place-trigger-order': 'er',
  'edit-trigger-order': 'er',
  'cancel-trigger-order': 'er',
  'cancel-all-trigger-orders': 'er',
  'edit-limit-order': 'er',
  'cancel-limit-order': 'er',
  // Account setup — base chain
  'init-basket': 'base',
  'init-deposit-ledger': 'base',
  'delegate-basket': 'base',
  'deposit-direct': 'base',
  // Withdrawal — base chain
  'request-withdrawal': 'base',
  'execute-withdrawal': 'base',
} as const satisfies Record<string, Chain>

export type TxKind = keyof typeof TX_CHAIN

/** The chain a given builder endpoint targets. */
export function chainForTx(kind: TxKind): Chain {
  return TX_CHAIN[kind]
}

/** Human note appended to tool output so the caller passes the right value to sign_and_send. */
export function chainHint(kind: TxKind): string {
  const chain = TX_CHAIN[kind]
  return chain === 'er'
    ? 'Submit on the Ephemeral Rollup: call sign_and_send with network="er".'
    : 'Submit on the base chain: call sign_and_send with network="base".'
}
