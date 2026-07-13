# flash-trade-mcp — CLAUDE.md

MCP server wrapping the Flash Trade **V2** (MagicBlock Ephemeral Rollup) REST API for AI-agent interaction. Published to npm as [`flash-trade-mcp`](https://www.npmjs.com/package/flash-trade-mcp).

## Build & Dev

```bash
bun install
bun run dev          # run MCP server (stdio)
bun run test         # vitest (MSW-mocked); RUN_INTEGRATION=1 adds live read-only + protocol tests
bun run typecheck    # tsc --noEmit  ← the type gate
bun run build        # bundle to dist/
```

CI runs typecheck + unit tests + build on PRs touching `mcp/**`. Publish triggers on a `v*` tag (OIDC trusted publishing). Direct pushes to `main` are blocked — changes go through a PR.

## Architecture

- `src/index.ts` — entry; registers all tools + resources over stdio
- `src/config.ts` — resolves the network from env (apiBaseUrl + erRpcUrl + baseRpcUrl + keypairPath); all have working defaults
- `src/client/network.ts` — **`TX_CHAIN`**: the two-chain routing table (endpoint → er|base). Single source of truth; asserted by tests
- `src/client/errors.ts` — `FlashApiError` normalizing the four error channels + `assertNoErr`
- `src/client/types.ts` — V2 request/response types (faithful to the LIVE backend)
- `src/client/flash-api.ts` — thin typed client (35 REST methods); never signs or submits
- `src/tools/*.ts` — one file per tool group; `shared/format.ts` (mark-price PnL), `shared/tx.ts` (chain-routing footer), `shared/custody-map.ts`
- `src/tools/sign-and-send.ts` — the ONLY tool that signs + submits; routes by the required `network` arg

## Key patterns

- Tools use Zod raw-shape `inputSchema` (SDK 1.x). `zBool` handles string "true"/"false" (`z.coerce.boolean` is broken — `Boolean("false") === true`).
- Every transaction tool returns a preview + the unsigned base64 + a footer stating which `network` to pass to `sign_and_send`.
- `sanitizeError` strips anything key-shaped from error text.
- Response types are structural — the backend adds fields over time; extra fields are ignored, never rejected.

## V2 domain knowledge (read before building transactions)

### Two chains — the top failure mode
Trading txs (`open/close/reverse/collateral/triggers/limits/tp-sl`) submit to the **Ephemeral Rollup** (`ER_RPC_URL`). Setup (`init_basket/init_deposit_ledger/delegate_basket/deposit_direct`) and withdrawal (`request/execute_withdrawal`) submit to the **base chain** (`SOLANA_RPC_URL`). The routing table is `TX_CHAIN`; every tool's output tells the caller the exact `network` value. Submitting to the wrong chain fails to land.

### Partially-signed transactions
The API returns transactions with its signer slots pre-filled and the blockhash chosen for the target chain. `sign_and_send` adds only the local keypair's signature and NEVER replaces the blockhash (that would invalidate the server's signatures). Blockhashes expire in ~60s — sign promptly.

### Account lifecycle (one-time, in order — the program enforces it)
`init_basket → init_deposit_ledger → delegate_basket → deposit_direct`, then trade. Detect "not set up" via `get_owner` (`basketPubkey == null`). Funds move only on explicit user approval — never bundle a deposit into setup.

### Mint vs symbol
`deposit_direct`, `request_withdrawal`, `execute_withdrawal` take a token **MINT** (resolve via `get_tokens`, which flags `isToken2022`). Every trading tool takes a **symbol**. Unknown mints silently assume 6 decimals — wrong for Token-2022.

### Four error channels
`body-err` (HTTP 200 with a non-null `err` — trading/preview), `http-400` (plain text — trigger/limit price validation), `http-422` (plain text — request schema/missing field), `http-500` (empty — setup/withdrawal, reason server-side only). `execute_withdrawal` failing with `0xbc4 / AccountNotInitialized(settlement_receipt)` is a ~30–90s TIMING state, not a failure — retry.

### Derived values
Position PnL/leverage/liquidation are computed from the live mark price (`shared/format.ts` → `computePositionView`), because the indexer values exits through `tradeSpread` and degenerate near liquidation. `youRecieveUsdUi` is misspelled in the API on purpose — mirrored verbatim.

### Collateral & fees
Limit/TP/SL require >$10 collateral AFTER entry fees — open with ≥$11. `open_position` warns when a bundled TP/SL would drop below the line. `reverse_position` applies a fixed 2% haircut to close proceeds.

## Config / endpoints

Serves the V2 surface at ROOT (`https://flashapi.trade`); the documented `/v2` edge prefix is not deployed (set `FLASH_API_URL` to override). ER RPC `https://flash.magicblock.xyz`; base RPC mainnet-beta. See [`../V2-ALIGNMENT.md`](../V2-ALIGNMENT.md) for the full endpoint reference and the live-vs-spec drift notes.
