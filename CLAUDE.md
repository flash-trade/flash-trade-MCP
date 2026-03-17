# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start (for Claude Code sessions)

```bash
bun install                              # Install deps (if fresh clone)
bun run ci                               # Verify everything works (lint + types + 61 tests)
bun run dev --help                       # See all commands
bun run dev perps markets --pool Crypto.1  # Test with live data
```

If config doesn't exist yet: `bun run dev config list` creates it automatically.

To run any command: `bun run dev <command>` (equivalent to `bun run src/index.ts <command>`).

## Project Overview

Flash Trade CLI (`flash`) — TypeScript CLI for Flash Trade's perpetual DEX on Solana.
Uses flash-sdk v15.4.1 for on-chain interaction, Commander.js for parsing, Bun as runtime.

## Commands

```bash
bun run dev              # Run TypeScript directly
bun run build            # Compile ESM bundle
bun run build:binary     # Multi-platform binaries (scripts/build.sh)
bun run lint             # oxlint
bun run typecheck        # tsc --noEmit
bun run ci               # lint + typecheck + test
bun test                 # Bun native tests
bun run day0             # Bun + Anchor compatibility check
```

## Architecture

**Entry:** `src/index.ts` — Commander setup, 8 command groups registered.

**Commands** (`src/commands/`):
- `ConfigCommand` — config list, set
- `KeysCommand` — keys list, add, delete, edit, use, import
- `PerpsCommand` — perps markets, positions, orders, open, close, set, limit, cancel, history
- `EarnCommand` — earn pools, deposit, withdraw, stake, unstake, claim, convert
- `SpotCommand` — spot tokens, quote, swap, portfolio
- `FafCommand` — faf status, deposit, unstake, cancel-unstake, withdraw, claim, claim-revenue
- `RewardsCommand` — rewards claim, history
- `AirdropCommand` — airdrop claim (devnet only)

**Libraries** (`src/lib/`):
- `Config` — `~/.config/flash/settings.json` management with validation
- `Signer` — Keypair → NodeWallet → AnchorProvider bridge
- `KeyPair` — BIP39/BIP32 generation, recovery, Solana CLI import, 0o600 permissions
- `KeyEncryption` — 3-tier: scrypt+AES (default), OS keychain (opt-in), plaintext (automation)
- `FlashClient` — flash-sdk PerpetualsClient wrapper, pool discovery, position/order reading
- `TxExecutor` — Full TX pipeline: build → simulate → prompt → send → confirm → audit
- `Asset` — Token metadata resolution from PoolConfig (case-insensitive)
- `Output` — Table/JSON dual-format output with formatters
- `NumberConverter` — String-based BN-safe conversions via BigNumber.js
- `PriceService` — Pyth Hermes REST → OraclePrice construction with 5s cache
- `ErrorHandler` — 52 program error codes, 8 extraction methods, fallback patterns
- `Confirmation` — Simulation prompts, priority fee estimation, key deletion safety
- `AuditLog` — JSONL transaction history at ~/.config/flash/history.jsonl
- `RpcManager` — Connection pooling with exponential backoff failover

## Critical Patterns

1. **BN-safe arithmetic** — NEVER use JS `number` for on-chain values. Use `string` → BigNumber → BN.
   `NumberConverter.toNative("1.005", 6)` → correct. `new BN(1.005 * 1e6)` → WRONG.
2. **Oracle price flow** — Fetch from Pyth Hermes → construct OraclePrice → apply slippage via
   `getPriceAfterSlippage()` → pass ContractOraclePrice to SDK methods. Strip `0x` from pythPriceId.
3. **SDK returns instructions** — All perpClient methods return `{ instructions, additionalSigners }`.
   CLI wraps into TxBundle with ALTs, builds VersionedTransaction, signs, simulates, sends.
4. **Error extraction** — 8 methods to extract codes from different formats. Always call
   `ErrorHandler.extractCode()` then `ErrorHandler.getMessage()` before displaying errors.
5. **Key security** — 3 tiers. Default: passphrase (scrypt+AES-256-GCM, N=2^14). Opt-in: OS keychain.
   Automation: plaintext with 0o600.
6. **Global options** — `--key`, `--address`, `--cluster`, `--rpc`, `--output`, `--yes`, `--dry-run`.
   Subcommands read parent opts via `cmd.parent?.parent?.opts()`.

## SDK Integration

- flash-sdk v15.4.1, @solana/web3.js 1.98.2, @coral-xyz/anchor 0.32.1
- PerpetualsClient constructor: 6 required params + optional useExtOracleAccount
- Three middle constructor params (composability, nft, reward) are UNUSED backward compat
- All amounts: USD_DECIMALS=6, LP_DECIMALS=6, FAF_DECIMALS=6, BPS_POWER=10000
- Side enum: `Side.Long = { long: {} }`, `Side.Short = { short: {} }`
- Privilege enum: `Privilege.None`, `Privilege.Stake`, `Privilege.Referral`
- Oracle: SDK does NOT fetch prices. Caller must provide ContractOraclePrice.
- Anchor TS types cause TS2589 recursion — cast through `any` for `program.account.*`
- Pyth price IDs in SDK have `0x` prefix — strip before calling Hermes API
- Long markets use target token as collateral (ETH/ETH, SOL/SOL) — use `swapAndOpen` when user pays with USDC
- Up to 5 trigger orders (TP/SL) per market position — each can close a different % of position
- `placeTriggerOrder` creates a new order each call (up to 5); `editTriggerOrder` modifies existing by orderId
