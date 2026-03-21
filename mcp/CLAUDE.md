# flash-trade-mcp

MCP server wrapping the Flash Trade REST API for AI agent interaction.

## Build & Dev

```bash
bun install          # Install deps
bun run dev          # Run MCP server (stdio)
bun run test         # Run tests (26 pass, 9 skip — integration needs live API)
bun run build        # Compile binary
bun run typecheck    # Type check
```

## Architecture

- `src/index.ts` — Server entry, registers all tools and resources
- `src/config.ts` — Loads FLASH_API_URL, FLASH_API_TIMEOUT, WALLET_PUBKEY from env
- `src/client/` — Typed HTTP client for Flash Trade REST API
- `src/tools/` — MCP tool definitions (one file per tool or tool group)
- `src/resources/` — MCP resource definitions
- `tests/mocks/` — MSW handlers for unit tests

## Key Patterns

- All tools use Zod schemas for input validation
- HTTP client returns typed responses; errors mapped to MCP error codes
- Non-custodial: transaction tools return base64 unsigned transactions
- Tool descriptions written for AI agent comprehension
- Bun runtime — auto-loads .env, native TypeScript

## Environment Variables

```bash
FLASH_API_URL=https://flashapi.trade  # Required: Flash Trade API base URL
FLASH_API_TIMEOUT=30000                            # Optional: HTTP timeout in ms
WALLET_PUBKEY=<solana-pubkey>                      # Optional: default wallet for tx building
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com # Used by scripts only
```

---

## AI Agent Domain Knowledge

**This section is critical for any AI agent using these MCP tools.** Read this before building transactions.

### Collateral & Fee Rules (IMPORTANT)

- **Minimum collateral >$10 AFTER fees**: Limit orders, take-profit (TP), and stop-loss (SL) all require more than $10 in remaining collateral after entry fees are deducted. If you open a $10 position, fees reduce the collateral below $10, and you CANNOT place TP/SL/limit orders on that position.
- **Always use at least $11 for positions needing TP/SL/limit orders.** This accounts for the ~0.06-0.1% entry fee. For safety, $12+ is recommended.
- Entry fee is shown in `open_position` response as `entryFee` and `openPositionFeePercent`.
- Exit fee is shown in `close_position` response as `fees`.
- Hourly borrow rate applies to leveraged positions (shown as `marginFeePercentage` in open_position response).

### Transaction Flow (Non-Custodial)

1. Call a transaction tool (`open_position`, `close_position`, `add_collateral`, `remove_collateral`, `reverse_position`)
2. Tool returns a preview (fees, prices, leverage, liquidation) AND a `transactionBase64` string
3. **Always show the preview to the user before they sign**
4. The user signs the base64 transaction with their wallet and submits to Solana
5. The MCP server never touches private keys

### Order Types

| Type | Description | Collateral Requirement |
|------|-------------|----------------------|
| **Market** | Executes immediately at oracle price + slippage | Any amount |
| **Limit** | Executes when price hits target | >$10 after fees |
| **Take-Profit (TP)** | Closes position at profit target | >$10 after fees |
| **Stop-Loss (SL)** | Closes position to limit loss | >$10 after fees |

- Up to 5 trigger orders (TP/SL) per position, each can close a different % of the position
- TP and SL are set via the `take_profit` and `stop_loss` params on `open_position`, or added later via the CLI
- Use `preview_tp_sl` tool to calculate TP/SL prices and projected PnL before placing

### Position Mechanics

- **SOL positions use JitoSOL** as underlying collateral on-chain
- **Long markets use the target token as collateral** (ETH/ETH, SOL/SOL). When user pays with USDC, an automatic swap occurs.
- Leverage is a multiplier on collateral: $10 collateral at 5x = $50 position size
- Liquidation price moves closer to current price as leverage increases

### Protocol Constraints

- No swap features (Flash Trade not whitelisted for Jupiter swaps)
- Pyth prices are mainnet only (devnet returns stale/zero)
- Amounts are in UI format (human-readable, e.g. "100.0") not native format

---

## MCP Tool Catalog

### Read Tools (no transactions)

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `health_check` | Verify API connectivity | none |
| `get_markets` | List all perp markets (SOL, BTC, ETH, etc.) | none |
| `get_market` | Market details by pubkey | `pubkey` |
| `get_pools` | List liquidity pools | none |
| `get_pool` | Pool details by pubkey | `pubkey` |
| `get_custodies` | List custody accounts (token holdings) | none |
| `get_custody` | Custody details by pubkey | `pubkey` |
| `get_prices` | All current oracle prices | none |
| `get_price` | Price for one symbol (e.g. "SOL") | `symbol` |
| `get_positions` | List positions, optionally by owner | `owner?` |
| `get_position` | Single position by pubkey | `pubkey` |
| `get_orders` | List orders, optionally by owner | `owner?` |
| `get_order` | Single order by pubkey | `pubkey` |
| `get_pool_data` | Pool AUM, LP stats, utilization | `pool_pubkey?` |

### Preview Tools (calculations, no transactions)

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `preview_limit_order_fees` | Estimate fees before placing limit order | `market_symbol`, `input_amount`, `output_amount`, `side` |
| `preview_exit_fee` | Estimate close cost | `position_key`, `close_amount_usd` |
| `preview_tp_sl` | Calculate TP/SL prices and projected PnL | `mode` (forward/reverse_pnl/reverse_roi), position params |
| `preview_margin` | Preview add/remove collateral effect | `position_key`, `margin_delta_usd`, `action` |

### Transaction Tools (return unsigned base64 transactions)

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `open_position` | Open new perp position | `input_token_symbol`, `output_token_symbol`, `input_amount`, `leverage`, `trade_type`, `owner` |
| `close_position` | Close/partial close position | `position_key`, `input_usd`, `withdraw_token_symbol` |
| `add_collateral` | Add collateral (reduce leverage) | `position_key`, `deposit_amount`, `deposit_token_symbol`, `owner` |
| `remove_collateral` | Remove collateral (increase leverage) | `position_key`, `withdraw_amount_usd`, `withdraw_token_symbol`, `owner` |
| `reverse_position` | Close + open opposite direction | `position_key`, `owner` |

### Typical AI Agent Workflow

```
1. health_check                          → Verify API is up
2. get_markets                           → See available markets
3. get_prices                            → Check current prices
4. get_positions (owner=<wallet>)        → Check existing positions
5. open_position (input_amount="12.0")   → Build trade (use $12+ for TP/SL!)
   → Show preview to user
   → User signs and submits transaction
6. get_positions (owner=<wallet>)        → Verify position opened
7. preview_tp_sl                         → Calculate TP/SL levels
8. close_position                        → When ready to exit
```

### Common Gotchas for AI Agents

1. **$10 minimum**: Don't open $10 positions if you plan to set TP/SL — fees eat into collateral. Use $11-12 minimum.
2. **Always preview first**: Show the user entry price, fees, leverage, and liquidation price before they sign.
3. **Position key**: You need the position's on-chain pubkey (from `get_positions`) to close, add/remove collateral, or set TP/SL.
4. **Slippage**: Default 0.5%. Increase for volatile markets or large positions.
5. **Degen mode**: Must be explicitly enabled for leverage above normal limits.
6. **Mainnet prices only**: Devnet will return stale or zero prices from Pyth oracles.
