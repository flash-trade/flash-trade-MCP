<div align="center">

# Flash Trade

**Perpetual DEX tooling for [Flash Trade](https://flash.trade) on Solana — CLI + MCP Server**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Solana](https://img.shields.io/badge/Blockchain-Solana-9945FF?logo=solana)](https://solana.com)

</div>

---

## Repository Structure

```
flash-trade-MCP/
├── cli/       # Rust CLI — direct SDK interaction, local signing
├── mcp/       # TypeScript MCP Server — AI agent interface via REST API
```

### `cli/` — Flash Trade CLI (Rust)

Native Rust CLI using flash-sdk directly for instruction building. Wallet management, position trading, LP operations, and FAF staking.

```bash
cd cli
cargo build
cargo run -- --help
cargo test                    # 41 tests
```

See [`cli/CLAUDE.md`](./cli/CLAUDE.md) for architecture and conventions.

### `mcp/` — Flash Trade MCP Server (TypeScript)

[Model Context Protocol](https://modelcontextprotocol.io) server that wraps the Flash Trade REST API. Designed for AI agents (Claude, GPT, etc.) to read market data and build unsigned transactions.

```bash
cd mcp
bun install
bun run dev                   # Start MCP server (stdio)
bun run test                  # 26 tests
```

See [`mcp/CLAUDE.md`](./mcp/CLAUDE.md) for tool catalog, domain knowledge, and integration guide.

---

## Key Concepts

- **Non-custodial**: Transaction tools return unsigned base64 transactions. The user's wallet signs and submits separately.
- **Perpetuals on Solana**: Leveraged long/short positions on SOL, BTC, ETH, and more via Flash Trade's on-chain program.
- **Pyth Oracle Prices**: All prices from Pyth Lazer (200ms updates). Mainnet only — devnet returns stale/zero.
- **SOL positions use JitoSOL** as underlying collateral on-chain.

---

## Environment Setup

Both projects need a Solana RPC endpoint. Set via environment variable:

```bash
export SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

For better performance, use a dedicated RPC (Helius, Triton, etc.).

---

<div align="center">

**Built with [flash-sdk](https://github.com/flash-trade/flash-contracts-closed) · Powered by [Solana](https://solana.com) · Prices from [Pyth](https://pyth.network)**

</div>
