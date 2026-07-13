// ─────────────────────────────────────────────────────────────────────────────
// tx.ts — standard footer for every tool that returns an unsigned transaction.
// It states the base64 tx, WHICH chain to submit on (the top failure mode is
// submitting to the wrong chain), and the exact sign_and_send call to make.
// ─────────────────────────────────────────────────────────────────────────────

import { chainForTx, type TxKind } from '../../client/network.ts'

/** Append the unsigned-tx block + chain routing instruction to a tool's output. */
export function txFooter(kind: TxKind, transactionBase64: string | null | undefined): string {
  const network = chainForTx(kind)
  if (!transactionBase64) {
    return '\nNo transaction was built.'
  }
  return [
    '',
    `Transaction (base64, unsigned — targets the ${network === 'er' ? 'EPHEMERAL ROLLUP' : 'BASE'} chain):`,
    transactionBase64,
    '',
    `To submit: call sign_and_send with network="${network}". ` +
      (network === 'er'
        ? '(Trading transactions land on the Ephemeral Rollup RPC.)'
        : '(Setup/withdrawal transactions land on the base-chain Solana RPC.)'),
    'Show this preview to the user and get approval BEFORE signing. Sign promptly — blockhashes expire in ~60s.',
  ].join('\n')
}
