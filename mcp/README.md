# flash-trade-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for **Flash Trade V2** — a Solana perpetuals DEX running on a MagicBlock Ephemeral Rollup (ER). Gives AI agents (Claude, Cursor, Windsurf, …) typed tools to read markets, set up trading accounts, preview and build unsigned transactions, and sign/submit them to the correct chain.

## Quick start

Add to your editor's MCP config — no cloning or building needed:

```json
{
  "mcpServers": {
    "flash-trade": {
      "command": "npx",
      "args": ["-y", "flash-trade-mcp"]
    }
  }
}
```

To sign and submit from the MCP (optional), add a keypair path:

```json
      "env": { "KEYPAIR_PATH": "/path/to/keypair.json" }
```

Every endpoint has a working default; you don't need any env vars to read markets and build unsigned transactions.

## What's different about V2

- **Two chains.** Trading transactions submit to the Ephemeral Rollup RPC (`ER_RPC_URL`); account setup and withdrawal transactions submit to the base-chain Solana RPC (`SOLANA_RPC_URL`). Every transaction tool tells you which chain it built for, and `sign_and_send` takes a required `network` argument — submitting to the wrong chain fails to land.
- **Baskets + deposit ledger.** A wallet trades from a per-wallet basket funded through a deposit ledger. First-time setup is `init_basket → init_deposit_ledger → delegate_basket → deposit_direct` (the on-chain program enforces the order). `get_owner` reports which step, if any, is missing.
- **Partially-signed transactions.** The API returns transactions with its own signer slots pre-filled and the blockhash chosen. The wallet adds only its signature; the blockhash is never replaced.
- **Mark-price PnL.** Position PnL/leverage/liquidation are computed from the live mark price, not the spread-distorted indexer values.

## Tools (40)

**Reads:** `health_check`, `get_tokens`, `get_prices`, `get_price`, `get_markets`, `get_market`, `get_pools`, `get_pool`, `get_custodies`, `get_custody`, `get_pool_data`, `get_owner`, `get_positions`, `get_orders`, `get_basket`, `get_account_summary`, `get_trading_overview`

**Setup (base chain):** `init_basket`, `init_deposit_ledger`, `delegate_basket`, `deposit_direct`

**Trading (ER):** `open_position` (omit owner for a free quote), `close_position`, `reverse_position`, `add_collateral`, `remove_collateral`, `place_tp_sl`, `place_trigger_order`, `edit_trigger_order`, `cancel_trigger_order`, `cancel_all_trigger_orders`, `edit_limit_order`, `cancel_limit_order`

**Withdrawal (base chain):** `request_withdrawal`, `execute_withdrawal`

**Previews:** `preview_limit_order_fees`, `preview_exit_fee`, `preview_tp_sl`, `preview_margin`

**Signing:** `sign_and_send` (required `network`: `"er"` or `"base"`)

See [`llms.txt`](./llms.txt) for the agent-facing catalog and [`CLAUDE.md`](./CLAUDE.md) for the full integration guide.

## Configuration

| Env | Purpose | Default |
|---|---|---|
| `FLASH_API_URL` | Hosted V2 REST base | `https://flashapi.trade` (root — the `/v2` edge prefix is not deployed) |
| `ER_RPC_URL` | Ephemeral Rollup RPC (trading txs) | `https://flash.magicblock.xyz` |
| `SOLANA_RPC_URL` | Base-chain RPC (setup/withdrawal txs) | `https://api.mainnet-beta.solana.com` |
| `FLASH_API_TIMEOUT` | HTTP timeout (ms) | `30000` |
| `WALLET_PUBKEY` | Default owner pubkey | — |
| `KEYPAIR_PATH` | Keypair for `sign_and_send` | `~/.config/solana/id.json` |

## Development

```bash
bun install
bun run dev          # run the server over stdio
bun run test         # unit tests (MSW-mocked); RUN_INTEGRATION=1 adds live read-only checks
bun run typecheck    # tsc --noEmit
bun run build        # bundle to dist/
```

Non-custodial. Mainnet. Real funds — always preview before signing.
