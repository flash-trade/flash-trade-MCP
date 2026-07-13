import { describe, it, expect } from 'vitest'
import { TX_CHAIN, chainForTx, chainHint } from '../../src/client/network.ts'

// The two-chain routing table is the single source of truth for which chain a
// built transaction must be submitted to. Submitting to the wrong chain is the
// top failure mode — these tests lock the mapping.

describe('two-chain routing table (TX_CHAIN)', () => {
  const TRADING = [
    'open-position', 'close-position', 'reverse-position', 'add-collateral', 'remove-collateral',
    'place-tp-sl', 'place-trigger-order', 'edit-trigger-order', 'cancel-trigger-order',
    'cancel-all-trigger-orders', 'edit-limit-order', 'cancel-limit-order',
  ] as const
  const SETUP_AND_WITHDRAWAL = [
    'init-basket', 'init-deposit-ledger', 'delegate-basket', 'deposit-direct',
    'request-withdrawal', 'execute-withdrawal',
  ] as const

  it('every trading builder routes to the ER', () => {
    for (const kind of TRADING) expect(chainForTx(kind)).toBe('er')
  })

  it('every setup + withdrawal builder routes to base', () => {
    for (const kind of SETUP_AND_WITHDRAWAL) expect(chainForTx(kind)).toBe('base')
  })

  it('the table covers exactly the 18 transaction-builder endpoints', () => {
    expect(Object.keys(TX_CHAIN).sort()).toEqual([...TRADING, ...SETUP_AND_WITHDRAWAL].sort())
  })

  it('chainHint tells the caller the exact sign_and_send network', () => {
    expect(chainHint('open-position')).toContain('network="er"')
    expect(chainHint('init-basket')).toContain('network="base"')
  })
})
