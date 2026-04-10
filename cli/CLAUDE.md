# flash-cli — CLAUDE.md

## Overview

Rust-native CLI for Flash Trade perpetuals protocol. Uses the Rust SDK directly for instruction building.

## Build & Run

```bash
cargo build                    # Debug build
cargo build --release          # Release build
cargo run -- --help            # Show help
cargo run -- perps markets     # Example command
cargo test                     # Run all tests
cargo clippy                   # Lint
```

## Architecture

- `src/cli/` — Clap derive structs defining all commands and arguments
- `src/core/` — Infrastructure: wallet, config, RPC, prices, tx engine, pool config
- `src/commands/` — Command handlers (one file per command)
- `src/enrichment/` — PnL, leverage, liquidation calculations using SDK sync_functions
- `src/output/` — Table and JSON formatting
- `src/error.rs` — Unified error types

## Key Dependencies

- `flash-sdk` (git dep from `flash-trade/flash-contracts-closed`, branch `feature/rust-sdk`) — Instruction builders, pool configs, calculations
- `anchor-lang 0.32.1` — Program type generation
- `solana-sdk/client 2.2` — RPC, transaction types, keypairs
- `clap 4` (derive) — CLI framework
- `tokio 1` — Async runtime

## Conventions

- All amounts are human-readable (USD or token units) at the CLI boundary, converted to native (u64) internally
- Wallet keypairs and config live under the platform-specific config dir resolved via `dirs::config_dir()`:
  - macOS: `~/Library/Application Support/flash/`
  - Linux: `~/.config/flash/` (or `$XDG_CONFIG_HOME/flash/`)
  - Windows: `%APPDATA%\flash\`
- Keypairs at `<config_dir>/keys/<name>.json` with `0o600` permissions (dir `0o700`)
- Settings at `<config_dir>/settings.json` with `0o600` permissions (may contain RPC API keys)
- Default collateral token: USDC
- Default slippage: 100 bps (1%)

## Protocol Constraints

- No swap commands — Flash not whitelisted for Jupiter swaps
- Pyth prices mainnet only — devnet returns stale data
- SOL positions use JitoSOL as underlying collateral
- Program ID mainnet: `FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn`
- Program ID devnet: `FTPP4jEWW1n8s2FEccwVfS9KCPjpndaswg7Nkkuz4ER4`
