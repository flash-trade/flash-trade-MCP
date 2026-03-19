# flash-mcp

MCP server wrapping the Flash Trade REST API for AI agent interaction.

Published to NPM as [`flash-mcp`](https://www.npmjs.com/package/flash-mcp).

## Build & Dev

```bash
bun install          # Install deps
bun run dev          # Run MCP server (stdio)
bun run test         # Run tests (26 pass, 9 skip — integration needs live API)
bun run build        # Compile to dist/
bun run typecheck    # Type check
```

## CI & Releases

- **CI** (`.github/workflows/ci.yml`): Runs on PRs to `main` when `mcp/**` changes — typecheck, unit tests, build
- **Publish** (`.github/workflows/publish.yml`): Triggers on `v*` tags — builds and publishes to NPM via OIDC trusted publishing
- Direct pushes to `main` are blocked — all changes require a PR with passing CI

## Architecture

- `src/index.ts` — Server entry, registers all tools and resources
- `src/config.ts` — Loads FLASH_API_URL, FLASH_API_TIMEOUT, WALLET_PUBKEY from env; KEYPAIR_PATH + SOLANA_RPC_URL used by sign_and_send
- `src/client/` — Typed HTTP client for Flash Trade REST API
- `src/tools/` — MCP tool definitions (one file per tool or tool group)
- `src/resources/` — MCP resource definitions
- `tests/mocks/` — MSW handlers for unit tests

## Key Patterns

- All tools use Zod schemas for input validation
- HTTP client returns typed responses; errors mapped to MCP error codes
- Transaction tools return base64 unsigned transactions; `sign_and_send` tool signs + submits using local keypair
- Tool descriptions written for AI agent comprehension
- Bun runtime — auto-loads .env, native TypeScript

## Environment Variables

```bash
FLASH_API_URL=https://flashapi.trade  # Required: Flash Trade API base URL
FLASH_API_TIMEOUT=30000                            # Optional: HTTP timeout in ms
WALLET_PUBKEY=<solana-pubkey>                      # Optional: default wallet for tx building
KEYPAIR_PATH=~/.config/solana/id.json              # Optional: keypair for sign_and_send (default shown)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com # Optional: RPC for sign_and_send (default shown)
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

### Transaction Flow

1. Call a transaction tool (`open_position`, `close_position`, `add_collateral`, `remove_collateral`, `reverse_position`)
2. Tool returns a preview (fees, prices, leverage, liquidation) AND a `transactionBase64` string
3. **Always show the preview to the user before they sign**
4. Once the user approves, call `sign_and_send` with the `transactionBase64` to sign and submit
5. `sign_and_send` reads the local Solana keypair, signs the transaction, submits it, and returns the confirmed signature
6. If the user prefers manual signing, they can sign the base64 transaction with their own wallet instead of using `sign_and_send`

**CRITICAL: Blockhash expiry** — Solana blockhashes expire in ~60 seconds. Call `sign_and_send` promptly after receiving the `transactionBase64`. If the blockhash expires, re-call the transaction tool to get a fresh transaction and immediately call `sign_and_send`.

### Order Types

| Type | Description | Collateral Requirement |
|------|-------------|----------------------|
| **Market** | Executes immediately at oracle price + slippage | Any amount |
| **Limit** | Executes when price hits target | >$10 after fees |
| **Take-Profit (TP)** | Closes position at profit target | >$10 after fees |
| **Stop-Loss (SL)** | Closes position to limit loss | >$10 after fees |

- Up to 5 trigger orders (TP/SL) per position, each can close a different % of the position
- TP and SL can be set at open time via `take_profit`/`stop_loss` params on `open_position`
- TP/SL can also be added, edited, or canceled on existing positions via trigger order tools
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

### Trigger Order Tools (TP/SL management — return unsigned base64 transactions)

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `place_trigger_order` | Place TP or SL on existing position | `market_symbol`, `collateral_symbol`, `side`, `trigger_price`, `size_amount`, `is_stop_loss`, `owner` |
| `edit_trigger_order` | Edit existing TP/SL (change price/size) | `market_symbol`, `collateral_symbol`, `side`, `order_id`, `trigger_price`, `size_amount`, `is_stop_loss`, `owner` |
| `cancel_trigger_order` | Cancel a single TP or SL order | `market_symbol`, `collateral_symbol`, `side`, `order_id`, `is_stop_loss`, `owner` |
| `cancel_all_trigger_orders` | Cancel all TP/SL for a market+side | `market_symbol`, `collateral_symbol`, `side`, `owner` |

### Signing Tool

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `sign_and_send` | Sign a base64 transaction with local keypair and submit to Solana | `transaction_base64` |

The `sign_and_send` tool reads the keypair from `KEYPAIR_PATH` (default `~/.config/solana/id.json`) and submits via `SOLANA_RPC_URL`. It returns the confirmed transaction signature and a Solscan explorer link. **Always show the transaction preview to the user and get approval before calling this tool.**

### Typical AI Agent Workflow

```
1. health_check                          → Verify API is up
2. get_markets                           → See available markets
3. get_prices                            → Check current prices
4. get_positions (owner=<wallet>)        → Check existing positions
5. open_position (input_amount="12.0")   → Build trade (use $12+ for TP/SL!)
   → Show preview to user
   → User approves
6. sign_and_send (transaction_base64)    → Sign and submit (call immediately!)
7. get_positions (owner=<wallet>)        → Verify position opened
8. preview_tp_sl                         → Calculate TP/SL levels
9. place_trigger_order                   → Add TP/SL to position
   → sign_and_send (transaction_base64)  → Sign and submit
10. get_orders (owner=<wallet>)          → Verify trigger orders placed
11. edit_trigger_order                    → Adjust TP/SL if needed
12. close_position                        → When ready to exit
   → Show preview to user
   → User approves
13. sign_and_send (transaction_base64)   → Sign and submit
```

### Common Gotchas for AI Agents

1. **$10 minimum**: Don't open $10 positions if you plan to set TP/SL — fees eat into collateral. Use $11-12 minimum.
2. **Always preview first**: Show the user entry price, fees, leverage, and liquidation price before they sign.
3. **Sign immediately**: After user approves a preview, call `sign_and_send` right away. Solana blockhashes expire in ~60 seconds. If you get a "Blockhash not found" error, re-call the transaction tool and `sign_and_send` back-to-back.
4. **Position key**: You need the position's on-chain pubkey (from `get_positions`) to close, add/remove collateral, or set TP/SL.
5. **Slippage**: Default 0.5%. Increase for volatile markets or large positions.
6. **Degen mode**: Must be explicitly enabled for leverage above normal limits.
7. **Mainnet prices only**: Devnet will return stale or zero prices from Pyth oracles.
