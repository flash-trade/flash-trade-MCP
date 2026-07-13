# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo containing two projects:

```
flash-trade-MCP/
├── cli/       # Rust CLI — V2 REST client, local signing, two-chain routing
├── mcp/       # TypeScript MCP Server — V2 REST API wrapper, Bun runtime
```

Both target **Flash Trade V2** exclusively — the perpetuals program on a MagicBlock Ephemeral Rollup. Neither embeds an SDK; the hosted V2 API builds unsigned transactions and both tools sign locally. There is no V1 code in either project.

Each project has its own CLAUDE.md with detailed architecture and conventions:
- **CLI**: See [`cli/CLAUDE.md`](./cli/CLAUDE.md) — Rust, Cargo, V2 REST client, clap
- **MCP Server**: See [`mcp/CLAUDE.md`](./mcp/CLAUDE.md) — TypeScript, Bun, MCP SDK, Zod
- **Full V2 endpoint reference + live-vs-spec drift**: [`V2-ALIGNMENT.md`](./V2-ALIGNMENT.md)

## Quick Start

```bash
# CLI (Rust)
cd cli && cargo build && cargo test

# MCP Server (TypeScript)
cd mcp && bun install && bun run test
```

## Flash Trade Protocol — Key Domain Knowledge

Flash Trade V2 is a perpetual futures DEX on Solana, running the perpetuals program on a MagicBlock Ephemeral Rollup ("perps at 50 ms"). Critical concepts for any contributor:

### V2 architecture — two chains, baskets, partial signing
- **Two chains.** Trading (open/close/collateral/triggers/limits) submits to the **Ephemeral Rollup** RPC; account setup and withdrawals submit to the **base-chain** Solana RPC. Submitting to the wrong chain fails to land. Both tools route by endpoint class (CLI: `core/network.rs` `chain_for`; MCP: `client/network.ts` `TX_CHAIN`).
- **Baskets + deposit ledger.** Positions and orders live in a per-wallet basket PDA funded from a deposit ledger. One-time lifecycle, program-enforced order: `init-basket → init-deposit-ledger → delegate-basket → deposit-direct`, then trade; withdraw is a two-step `request → execute`.
- **Partially-signed transactions.** The API pre-fills its signer slots and chooses the blockhash for the target chain; the client adds ONLY the owner signature and NEVER replaces the blockhash (~60 s expiry).
- **Derived values.** PnL/leverage/liquidation are computed from the live mark price (GOTCHAS §20), not the indexer's spread-distorted numbers. `youRecieveUsdUi` is misspelled in the API on purpose — mirror it verbatim.
- **Endpoints serve at ROOT** (`https://flashapi.trade`); the documented `/v2` edge prefix is not deployed. Overrides: `FLASH_API_URL`, `ER_RPC_URL`, `SOLANA_RPC_URL`.

### Collateral & Fees
- **Minimum collateral >$10**: Limit orders, take-profit, and stop-loss all require more than $10 in collateral AFTER fees. Opening a $10 position means fees reduce collateral below $10, causing limit/TP/SL to fail. **Always use at least $11 for positions that need TP/SL/limit orders.**
- Entry/exit fees are deducted from collateral. The fee percentage varies by market and utilization.
- Hourly borrow rates apply to leveraged positions.

### Position Mechanics
- Transaction tools return unsigned base64. The `sign_and_send` MCP tool can sign and submit using the local Solana keypair, or the user can sign manually with their own wallet.
- SOL positions use JitoSOL as underlying collateral on-chain.
- Long markets use the target token as collateral (ETH/ETH, SOL/SOL).
- Up to 5 trigger orders (TP/SL) per market position.
- Pyth oracle prices are mainnet only — devnet returns stale/zero.

### Program IDs
- Mainnet: `FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn`
- Devnet: `FTPP4jEWW1n8s2FEccwVfS9KCPjpndaswg7Nkkuz4ER4`

### Available Markets
SOL, BTC, ETH, and other assets listed in Flash Trade pools (Crypto.1, etc.).

### Order Types
- **Market order**: Executes immediately at current oracle price + slippage
- **Limit order**: Executes when price hits target. Requires >$10 collateral after fees.
- **Take-profit (TP)**: Trigger order that closes position at profit target. Requires >$10 collateral.
- **Stop-loss (SL)**: Trigger order that closes position to limit loss. Requires >$10 collateral.
