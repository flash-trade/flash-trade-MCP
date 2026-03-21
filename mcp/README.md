# flash-trade-mcp

MCP server for [Flash Trade](https://flash.trade) perpetual DEX on Solana. Gives AI agents (Claude, GPT, etc.) tools to read market data, preview trades, and build unsigned transactions.

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- A Flash Trade API URL (production: `https://flashapi.trade`)

## Setup

```bash
bun install
cp .env.example .env
# Edit .env — set FLASH_API_URL
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FLASH_API_URL` | Yes | — | Flash Trade API base URL |
| `FLASH_API_TIMEOUT` | No | `30000` | HTTP timeout in milliseconds |
| `WALLET_PUBKEY` | No | — | Default wallet pubkey for transaction building |

## Add to Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "flash-trade": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/flash-trade-MCP/mcp/src/index.ts"],
      "env": {
        "FLASH_API_URL": "https://flashapi.trade"
      }
    }
  }
}
```

Or add to Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flash-trade": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/flash-trade-MCP/mcp/src/index.ts"],
      "env": {
        "FLASH_API_URL": "https://flashapi.trade"
      }
    }
  }
}
```

## Available Tools

### Read Tools (no transactions)

| Tool | Description |
|------|-------------|
| `health_check` | Verify API connectivity |
| `get_markets` | List all perpetual futures markets |
| `get_market` | Market details by pubkey |
| `get_pools` | List liquidity pools |
| `get_pool` | Pool details by pubkey |
| `get_custodies` | List custody accounts |
| `get_custody` | Custody details by pubkey |
| `get_prices` | Current oracle prices for all assets |
| `get_price` | Price for a single symbol (SOL, BTC, ETH) |
| `get_positions` | List positions, optionally by owner wallet |
| `get_position` | Single position by pubkey |
| `get_orders` | List orders (limit, TP, SL), optionally by owner |
| `get_order` | Single order by pubkey |
| `get_pool_data` | Pool AUM, LP stats, utilization |

### Preview Tools (calculations only)

| Tool | Description |
|------|-------------|
| `preview_limit_order_fees` | Estimate fees, entry price, liquidation price |
| `preview_exit_fee` | Estimate exit fee for closing a position |
| `preview_tp_sl` | Calculate TP/SL prices and projected PnL |
| `preview_margin` | Preview effect of adding/removing collateral |

### Transaction Tools (return unsigned base64)

| Tool | Description |
|------|-------------|
| `open_position` | Open a new perpetual position (market or limit) |
| `close_position` | Close or partially close a position |
| `add_collateral` | Add collateral to reduce leverage |
| `remove_collateral` | Remove collateral to increase leverage |
| `reverse_position` | Close + open opposite direction |

### Trigger Order Tools (TP/SL management)

| Tool | Description |
|------|-------------|
| `place_trigger_order` | Place TP or SL on an existing position |
| `edit_trigger_order` | Edit an existing TP/SL order |
| `cancel_trigger_order` | Cancel a single TP/SL order |
| `cancel_all_trigger_orders` | Cancel all TP/SL for a market+side |

## Platform Compatibility

This server uses **stdio transport** — it runs as a local process on the user's machine and communicates over stdin/stdout.

| Platform | Supported | Notes |
|----------|-----------|-------|
| Claude Code (CLI) | Yes | Add to `.mcp.json` in your project |
| Claude Desktop (app) | Yes | Add to `claude_desktop_config.json` |
| Cursor | Yes | Add via Cursor MCP settings |
| Windsurf | Yes | Add via MCP configuration |
| **Claude.ai (website)** | **No** | Requires remote HTTP transport (see below) |
| **Any cloud-hosted MCP** | **No** | Requires remote HTTP transport (see below) |

### Why Claude.ai doesn't work

Claude.ai's remote MCP feature needs a publicly accessible URL. It cannot spawn a local process on your machine. Supporting Claude.ai would require:

1. Migrating from `StdioServerTransport` to [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
2. Deploying to a hosting platform (Cloudflare Workers, Fly.io, Railway, etc.)
3. Adding authentication (the server would be publicly accessible)

This is on the roadmap but not yet implemented.

## Important Notes

- **Non-custodial**: Transaction tools return unsigned base64 transactions. The user's wallet signs and submits.
- **Minimum collateral >$10**: Limit orders, TP, and SL require more than $10 collateral after fees. Use at least $11-12 for positions needing TP/SL.
- **Mainnet only**: Pyth oracle prices are mainnet only. Devnet returns stale/zero.
- **Rate limit**: 10 requests per second.

## Development

```bash
bun run dev          # Start MCP server (stdio transport)
bun run test         # Run tests (26 pass, 9 skip for integration)
bun run typecheck    # Type check
bun run build        # Compile to binary
```

### Architecture

```
src/
  index.ts           # Entry point — registers tools, resources, starts stdio transport
  config.ts          # Env var loading (FLASH_API_URL, timeout, wallet)
  client/
    flash-api.ts     # Typed HTTP client for Flash Trade REST API
    types.ts         # Request/response type definitions
  tools/
    index.ts         # Tool registration barrel
    read.ts          # Read-only tools (markets, positions, prices)
    transactions.ts  # Transaction-building tools (open, close, collateral)
    previews.ts      # Preview/calculation tools
    trigger-orders.ts # TP/SL trigger order tools
    pool-data.ts     # Pool metrics tool
    ...
  resources/
    index.ts         # MCP resources (accounts snapshot, positions, orders)
tests/
  mocks/             # MSW handlers for unit tests
```

### API Documentation

Interactive Swagger docs are available at `{FLASH_API_URL}/docs/`.
