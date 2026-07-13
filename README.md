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
├── cli/       # Rust CLI — V2 REST client, local signing, two-chain routing
├── mcp/       # TypeScript MCP Server — AI agent interface via the V2 REST API
```

Both target **Flash Trade V2**, which runs the perpetuals program on a [MagicBlock](https://magicblock.gg) Ephemeral Rollup. Neither embeds an SDK: the hosted V2 API (`https://flashapi.trade`) builds unsigned transactions, and both tools sign locally and route each transaction to the right chain.

### `cli/` — Flash Trade CLI (Rust)

Native Rust CLI over the V2 REST API: reads, unsigned transaction building, local signing, and two-chain routing (trading → Ephemeral Rollup, setup/withdrawal → base chain). Wallet management, the account lifecycle (basket → deposit ledger → delegate → deposit), trading, triggers/limits, and withdrawals.

```bash
cd cli
cargo build
cargo run -- --help
cargo test                    # unit + inline (offline); RUN_INTEGRATION=1 adds live read-only smoke
```

See [`cli/README.md`](./cli/README.md) for the command reference and [`cli/CLAUDE.md`](./cli/CLAUDE.md) for architecture and conventions.

### `mcp/` — Flash Trade MCP Server (TypeScript)

[Model Context Protocol](https://modelcontextprotocol.io) server that wraps the Flash Trade REST API. Designed for AI agents (Claude, GPT, etc.) to read market data and build unsigned transactions.

**Quick start — just add to your editor config:**

```json
{
  "mcpServers": {
    "flash-trade": {
      "command": "npx",
      "args": ["-y", "flash-trade-mcp"],
      "env": {
        "FLASH_API_URL": "https://flashapi.trade"
      }
    }
  }
}
```

Works with Claude Code, Claude Desktop, Cursor, and Windsurf. No cloning or building needed.

See [`mcp/README.md`](./mcp/README.md) for full tool catalog and [`mcp/CLAUDE.md`](./mcp/CLAUDE.md) for AI agent integration guide.

---

## Key Concepts

- **Non-custodial**: Transaction endpoints return **partially-signed** unsigned base64 transactions — the API pre-fills its own signer slots and chooses the blockhash; you add only your signature.
- **Two chains**: Trading submits to the **Ephemeral Rollup** RPC; account setup and withdrawals submit to the **base-chain** Solana RPC. Submitting to the wrong chain fails to land.
- **Baskets + deposit ledger**: Positions and orders live in a per-wallet basket PDA funded from a deposit ledger, both created once before trading.
- **Perpetuals on Solana**: Leveraged long/short positions on SOL, BTC, ETH, forex, commodities, and more.
- **Oracle prices**: From Pyth Lazer. Mainnet only — the public V2 surface is mainnet.

---

## Environment Setup

Both projects resolve the V2 network from the environment, with working defaults — you can run reads with no configuration:

```bash
export FLASH_API_URL=https://flashapi.trade            # REST base (root; the /v2 edge prefix is not deployed)
export ER_RPC_URL=https://flash.magicblock.xyz         # trading submission (Ephemeral Rollup)
export SOLANA_RPC_URL=https://api.mainnet-beta.solana.com   # setup + withdrawal submission (base chain)
```

For better performance, point `SOLANA_RPC_URL` at a dedicated RPC (Helius, Triton, etc.).

---

## Contributing

All changes go through pull requests — direct pushes to `main` are blocked.

1. Create a feature branch
2. Make changes, push, open a PR
3. CI runs automatically (typecheck, unit tests, build)
4. PR can only merge once CI passes

## Releasing to NPM

Publishing is **not automatic on merge**. It only happens when you push a version tag:

```bash
# 1. Bump version in mcp/package.json (in a PR, merge it)
# 2. Tag the merge commit on main:
git tag v1.0.0
git push origin v1.0.0
# 3. The publish workflow triggers automatically → builds → publishes to NPM
```

No tag = no publish. Merging PRs only runs CI checks.

---

<div align="center">

**Flash Trade V2 on [MagicBlock](https://magicblock.gg) · Powered by [Solana](https://solana.com) · Prices from [Pyth](https://pyth.network)**

</div>
