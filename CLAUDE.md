# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo containing two projects:

```
flash-trade-MCP/
├── cli/       # Rust CLI — flash-sdk direct, local signing, cargo build/test
├── mcp/       # TypeScript MCP Server — REST API wrapper, Bun runtime
```

Each project has its own CLAUDE.md with detailed architecture and conventions:
- **CLI**: See [`cli/CLAUDE.md`](./cli/CLAUDE.md) — Rust, Cargo, flash-sdk, clap
- **MCP Server**: See [`mcp/CLAUDE.md`](./mcp/CLAUDE.md) — TypeScript, Bun, MCP SDK, Zod

## Quick Start

```bash
# CLI (Rust)
cd cli && cargo build && cargo test

# MCP Server (TypeScript)
cd mcp && bun install && bun run test
```

## Flash Trade Protocol — Key Domain Knowledge

Flash Trade is a perpetual futures DEX on Solana. Critical concepts for any contributor:

### Collateral & Fees
- **Minimum collateral >$10**: Limit orders, take-profit, and stop-loss all require more than $10 in collateral AFTER fees. Opening a $10 position means fees reduce collateral below $10, causing limit/TP/SL to fail. **Always use at least $11 for positions that need TP/SL/limit orders.**
- Entry/exit fees are deducted from collateral. The fee percentage varies by market and utilization.
- Hourly borrow rates apply to leveraged positions.

### Position Mechanics
- Non-custodial: all transactions are unsigned base64 — the user's wallet signs and submits.
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
