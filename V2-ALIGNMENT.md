# Flash Trade V2 Alignment — MCP + CLI

> Engineering record of the **V2-only clean-slate rebuild** of `flash-trade-MCP` (TypeScript MCP server + Rust CLI). Everything V1 was removed. This document is the ground-truth reference for the rebuild and the source for the release checklist.
>
> **Verified against the live API on 2026-07-13** (read-only probes of `https://flashapi.trade`). Where the live deployment and the published spec/client disagree, **live wins** and the drift is called out.

---

## 0. The base-URL finding (read this first)

The workspace documentation and the canonical `examples-v2` client both say the public V2 surface is `https://flashapi.trade/v2`. **That prefix is not deployed.** Empirically, on 2026-07-13:

| Request | Result |
|---|---|
| `GET https://flashapi.trade/health` | **200** — `{status:"ok", program:"ER", config.env:"dev"}` |
| `GET https://flashapi.trade/v2/health` | **404** |
| `GET https://flashapi.trade/prices/SOL` | **200** — `{priceUi: 76.29, marketSession:"regular", …}` |
| `GET https://flashapi.trade/v2/prices/SOL` | **404** |
| `GET https://flash-ui-api-rust-dev.fly.dev/v2/health` | **404** (root `/health` → 200) |

The live app serves the **entire V2/ER surface at root paths**. The `/v2` prefix is an intended edge-rewrite convention (edge strips `/v2` → forwards `/…` to the app) that is not active on the current deployment.

**Decision:** both clients default to `FLASH_API_URL = https://flashapi.trade` (root, verified working) and are fully configurable. Operators fronting the app with the `/v2` edge set `FLASH_API_URL=https://flashapi.trade/v2`. This is the single knob to change if prod topology differs — paths below are all relative to the base.

The deployment currently reports `env: dev` (dev pool-config, ~10% test spreads on SOL). This is the same host the UI uses; it is mainnet program state.

---

## 1. Endpoint → tool coverage matrix

All 35 REST endpoints (+1 WebSocket) of the live V2 surface. Paths are relative to `FLASH_API_URL`.

### Reads (GET)

| Endpoint | MCP tool | CLI command | Chain-agnostic |
|---|---|---|---|
| `/health` | `health_check` | `flash health` | — |
| `/tokens` | `get_tokens` | `flash tokens` | — |
| `/prices` | `get_prices` | `flash perps prices` | — |
| `/prices/{symbol}` | `get_price` | `flash perps price <sym>` | — |
| `/pool-data` | `get_pool_data` | `flash pools` | — |
| `/pool-data/{pool}` | `get_pool_data` (arg) | `flash pools --pool <pk>` | — |
| `/raw/markets` | `get_markets` | `flash perps markets` | — |
| `/raw/markets/{pubkey}` | `get_market` | — | — |
| `/raw/pools` | `get_pools` | — | — |
| `/raw/pools/{pubkey}` | `get_pool` | — | — |
| `/raw/custodies` | `get_custodies` | — | — |
| `/raw/custodies/{pubkey}` | `get_custody` | — | — |
| `/raw/baskets/{pubkey}` | `get_basket` (raw view) | `flash setup status` | — |
| `/owner/{owner}` | `get_owner`, `get_positions`, `get_orders`, `get_account_summary` | `flash perps positions/orders/account` | — |
| `/owner/{owner}/ws` | *(out of scope — see §5)* | *(out of scope)* | — |

### Trading — build unsigned tx, submit to **ER** (`ER_RPC_URL`)

| Endpoint | MCP tool | CLI command |
|---|---|---|
| `/transaction-builder/open-position` | `open_position` (owner optional = quote) | `flash perps open` |
| `/transaction-builder/close-position` | `close_position` | `flash perps close` |
| `/transaction-builder/reverse-position` | `reverse_position` | `flash perps reverse` |
| `/transaction-builder/add-collateral` | `add_collateral` | `flash perps add-collateral` |
| `/transaction-builder/remove-collateral` | `remove_collateral` | `flash perps remove-collateral` |
| `/transaction-builder/place-tp-sl` | `place_tp_sl` | `flash perps tp-sl` |
| `/transaction-builder/place-trigger-order` | `place_trigger_order` | `flash perps trigger place` |
| `/transaction-builder/edit-trigger-order` | `edit_trigger_order` | `flash perps trigger edit` |
| `/transaction-builder/cancel-trigger-order` | `cancel_trigger_order` (id 0–4, or 255=all) | `flash perps trigger cancel` |
| `/transaction-builder/cancel-all-trigger-orders` | `cancel_all_trigger_orders` | `flash perps trigger cancel-all` |
| `/transaction-builder/edit-limit-order` | `edit_limit_order` (omit=keep) | `flash perps limit edit` |
| `/transaction-builder/cancel-limit-order` | `cancel_limit_order` | `flash perps limit cancel` |

### Account setup — build unsigned tx, submit to **base** (`SOLANA_RPC_URL`)

| Endpoint | MCP tool | CLI command |
|---|---|---|
| `/transaction-builder/init-basket` | `init_basket` | `flash setup init-basket` |
| `/transaction-builder/init-deposit-ledger` | `init_deposit_ledger` | `flash setup init-ledger` |
| `/transaction-builder/delegate-basket` | `delegate_basket` (`{payer,owner}` only) | `flash setup delegate` |
| `/transaction-builder/deposit-direct` | `deposit_direct` (takes `tokenMint`) | `flash setup deposit` |

### Withdrawal — build unsigned tx, submit to **base** (`SOLANA_RPC_URL`)

| Endpoint | MCP tool | CLI command | Note |
|---|---|---|---|
| `/transaction-builder/request-withdrawal` | `request_withdrawal` | `flash withdraw request` | live ✓ |
| `/transaction-builder/execute-withdrawal` | `execute_withdrawal` | `flash withdraw execute` | **404 on live dev deployment (2026-07-13)** — implemented per spec + canonical client; see §6 |

### Previews (POST, read-only math — no tx, no chain)

| Endpoint | MCP tool | CLI command |
|---|---|---|
| `/preview/limit-order-fees` | `preview_limit_order_fees` | `flash perps preview limit-fees` |
| `/preview/exit-fee` | `preview_exit_fee` | `flash perps preview exit-fee` |
| `/preview/tp-sl` | `preview_tp_sl` | `flash perps preview tp-sl` |
| `/preview/margin` | `preview_margin` | `flash perps preview margin` |

### Out of scope (deliberate)

- `/owner/{owner}/ws` — WebSocket streaming. MCP is request/response; the CLI is one-shot. Polling `/owner/{owner}` covers both. Recorded decision, not an oversight (§5).
- `create-referral`, `init-token-stake` — exist on the live host (405 on GET = POST routes) but are **not part of the core V2 trading lifecycle** and were not in the rebuild scope. No tool. Can be added later if product wants them.

---

## 2. Two-chain routing (the highest-severity rule)

V2 spans two chains. A tx built by a builder endpoint carries a blockhash for a **specific** chain and must be submitted there; mixing them fails to land (GOTCHAS §5). The builder's endpoint class is the routing signal — there is no ambiguity.

```
BASE CHAIN  (SOLANA_RPC_URL, https://api.mainnet-beta.solana.com)
  init-basket · init-deposit-ledger · delegate-basket · deposit-direct
  request-withdrawal · execute-withdrawal

EPHEMERAL ROLLUP  (ER_RPC_URL, https://flash.magicblock.xyz)
  open-position · close-position · reverse-position
  add-collateral · remove-collateral
  place-tp-sl · place-trigger-order · edit-trigger-order · cancel-trigger-order
  cancel-all-trigger-orders · edit-limit-order · cancel-limit-order
```

Source of truth: `examples-v2/packages/flash-v2/src/lifecycle.ts:14-24` (the chain map) and each method's TSDoc in `client.ts`.

**Implementation contract:**
- Every builder method/tool tags its output with the chain it targets (`network: "er" | "base"`).
- The signer (`sign_and_send` / CLI submit) takes an **explicit, required** `network` argument — no silent default. Misrouting is the top failure mode; the tool that built the tx tells the caller exactly which value to pass.
- **Never replace the blockhash.** V2 txs come back **partially signed** — the server pre-filled its signer slots and chose the blockhash. The wallet adds only its own signature (web3.js `tx.sign([keypair])` fills just the matching slot; Rust: push the user signature into the correct slot).

---

## 3. Error channels (four, not three)

The published GOTCHAS §1 documents three channels; the live axum/utoipa layer adds a fourth (422). All four normalize to one error type with an actionable message.

| Channel | HTTP | Body | Meaning | Actionable message |
|---|---|---|---|---|
| `body-err` | 200 | JSON with non-null `err` | trading/preview logical failure | surface `err` verbatim |
| `http-400` | 400 | plain text | trigger/limit **price** validation | "price invalid vs oracle — see reason" |
| `http-422` | 422 | plain text (`Failed to deserialize … missing field 'owner'`) | **request schema** validation | "malformed/missing field — check params" |
| `http-500` | 500 | empty | setup/withdrawal server error (reason server-side only) | "verify inputs: tokenMint (not symbol)? lifecycle order? pool match?" |
| `http-other` | 404/405/429/503/network | varies | route/method/rate/availability | pass through with status |

The `body-err` check is the most-missed: **`err` arrives inside an HTTP 200** on trading and preview endpoints. The client asserts `!err` on every 200 JSON body.

---

## 4. Derived values — compute client-side, never trust the indexer number

Two V2 traps (GOTCHAS §18, §20). Both clients compute these locally and never surface the raw indexer figure as a product number.

**Available balance** is a double-entry netting, not any single account:
```
available = ledger.deposits − basket.debits + basket.pendingCredits      (clamp ≥ 0)
```
`ledger.deposits` is cumulative and never decrements on withdrawal; `basket.debits`/`pendingCredits` are the counter-entries. All three must come from the **same coherent source** (the ER-fed `/owner` snapshot). A half-delegated account breaks the invariant → clamp to 0 and treat as pre-delegation.

**Position PnL/leverage/liq** — the indexer values exits through `custody.pricing.tradeSpread` (e.g. 10% on SOL) and degenerates when `collateral − spread-loss ≤ 0`, so `positionMetrics.pnlWithFeeUsdUi` can read −229% on a −4% position. Compute what every perps UI computes, from the live mark price:
```
pricePnl = (mark − entry) / entry × size × dir          (dir = +1 long, −1 short)
pnl      = pricePnl − (exitFeeUsd + borrowFeeUsd) / 1e6
pct      = pnl / collateral × 100
leverage = size / collateral
liq     ≈ entry × (1 ∓ collateral / size × 0.92)
```
The spread is still real money at the fills (§21) — it just doesn't belong in the live PnL readout.

---

## 5. Recorded decisions

- **Polling over WebSocket.** `/owner/{owner}/ws` sends two frame types (`basket` full snapshot on chain change; `metrics` positions-only every tick) that must be merged. The MCP's tool model and the CLI's one-shot model both fit polling `/owner/{owner}`. WS is a future enhancement, not shipped. (GOTCHAS §7, §8.)
- **Lifecycle ordering is encoded in tool/command descriptions.** The API does not enforce order; the program does (GOTCHAS §6). Order: `init-basket → init-deposit-ledger → delegate-basket → deposit → trade → withdraw`. Detect "not set up" via `owner().basketPubkey == null`. `get_basket` / `flash setup status` report which step is missing.
- **Consent boundary (GOTCHAS §17).** Setup and funds movement are separate, explicitly-approved actions. Neither client bundles a deposit into setup. Withdraw is two approvals by design (`request` → `execute`).
- **Deposits take a MINT, trading takes SYMBOLS (GOTCHAS §11).** `deposit-direct`/`request-withdrawal`/`execute-withdrawal` take `tokenMint`; everything else takes a symbol. Resolve mints from `/tokens` (which also flags `isToken2022`); never hardcode.
- **`cancel_all_trigger_orders`.** Live exposes both a dedicated endpoint and the `orderId: 255` sentinel on `cancel-trigger-order`. The dedicated tool uses the dedicated endpoint; `cancel_trigger_order` also accepts `255`.
- **Edit semantics are opposite (GOTCHAS §13).** `edit-trigger-order` requires **both** price and size (no keep-existing); `edit-limit-order` treats **0/omitted as keep-existing**. Encoded per-schema.
- **`youRecieveUsdUi`** is misspelled in the API and mirrored verbatim (GOTCHAS §10). Confirmed live.

---

## 6. V1 removal inventory (deleted — not migrated)

**MCP (`mcp/`):** all legacy root read paths (`/markets`, `/pools`, `/custodies` — now `/raw/*`); the position-key-based request model (V2 is `marketSymbol`+`side`); `EnrichedPosition[]`/`EnrichedOrder[]` array types from `/positions/owner` + `/orders/owner` (now the `/owner` `BasketSnapshot`); the single-chain `sign_and_send` (base-only). No compat layer.

**CLI (`cli/`):** the `flash-sdk` git dependency (private repo, V1 branch), `anchor-lang`, on-chain instruction building (`core/tx_engine.rs`), Pyth Hermes price fetch (`core/prices.rs` — prices now come from the API `/prices`), V1 pool-config plumbing (`core/pool_config.rs`), SDK-based enrichment (`enrichment/` — replaced by API metrics + §4 formulas), the `core/rpc.rs` failover engine, the `output/formatter.rs`+`tables.rs` table layer, and every command with no V2 endpoint (FAF staking, LP liquidity ops, `collect_fees`, referral). Also removed the now-unused `comfy-table` and `chrono` deps. The V2 rebuild adds `core/api.rs` (typed REST client), `core/network.rs` (`chain_for` routing), `core/signer.rs` (partial-sign + submit), `core/compute.rs` (mark-price math), `commands/reads.rs` + `commands/txn.rs`, and a `src/lib.rs` so the binary and the external test suites share one definition of each module.

**Kept (V1-agnostic):** MCP — the `registerTool` per-file pattern, `sanitize.ts`/`zBool`, vitest+MSW harness, CI workflows, package identity `flash-trade-mcp`. CLI — clap conventions, wallet management (`core/wallet.rs`, 0o600 keys), config-dir conventions, table/JSON output (`output/`), `error.rs` style.

**execute-withdrawal deployment gap:** `/transaction-builder/execute-withdrawal` returns 404 on the live dev deployment as of 2026-07-13 (its sibling `request-withdrawal` is live). It is in `openapi.v2.json` and the canonical client, so the tool/command is implemented; it will function once the endpoint deploys. Flagged here so it is not mistaken for a client bug.

---

## 7. npm / release plan

- **Version:** `flash-trade-mcp` `0.4.1 → 0.5.0`. Tool **names** are preserved for existing consumers, but the request/response shapes, env vars (`ER_RPC_URL` added; `sign_and_send` now requires `network`), and default base URL change. The rewrite is breaking, but the package stays **pre-1.0** while the V2 surface settles: under semver a breaking change before 1.0 bumps the minor (`0.4 → 0.5`), which keeps room to iterate without yet promising a stable public API. `flash-cli` moves to `0.5.0` in lockstep (also resolves the 0.1.0-vs-"v0.2.0" git-log drift). Adopt `1.0.0` later as a deliberate "V2 is stable" milestone.
- **Changelog:** "V2-only rewrite — MagicBlock ER, baskets + deposit ledger, two-chain routing, four error channels. Breaking: request/response shapes, `sign_and_send` `network` arg, `ER_RPC_URL` env, root base URL default."
- **SDK pin:** `@modelcontextprotocol/sdk` stays on `^1.27.1` (current stable 1.29.0). The v2-alpha `@modelcontextprotocol/server` migration (raw shapes → wrapped schema objects) is noted as future work.
- **Release workflow (unchanged, gated):** merge `feat/v2-only` → CI green (typecheck + tests + build) → tag `v0.5.0` → `.github/workflows/publish.yml` publishes to npm via OIDC provenance. **Merge, tag, and publish are Kaleb's actions.**

---

## 8. Verification performed

- Live read-only mainnet probes (2026-07-13): `/health` (program:ER, env:dev), `/prices/SOL` ($76.29), `/tokens`, `/pool-data`, `/raw/markets`, `/owner/{owner}` (BasketSnapshot shape), quote-mode `open-position` (no owner → quote, tx=null), and route-existence checks for every builder endpoint. Nothing signed or submitted.
- Base-URL topology resolved (root vs `/v2`) across flashapi.trade and the dev Fly host.
- Error-channel shapes captured (200+err, 400 text, 422 serde text, 500 empty).

**MCP (`mcp/`):** `bun run typecheck` clean, unit tests + live read-only integration green, stdio protocol smoke (list tools + call reads/quote-open), V1-zero grep gate.

**CLI (`cli/`):** `cargo build` clean, `cargo clippy --all-targets` clean (0 warnings), 29 tests green (23 unit incl. the `chain_for` routing table + API DTOs + mark-price math, 3 live read-only integration, 3 inline). Live binary smoke against mainnet: `health` (env:dev), `price SOL`, `prices`, `tokens` (mint addresses), `markets`, quote-mode `perps open` (no wallet → quote-only). Nothing signed or submitted.

**Live-shape corrections found during CLI smoke (fixed):**
- `/tokens` field is `mint`, not the spec/`examples-v2`-client `mintKey`. (DTOs in both MCP and CLI use `mint`.)
- `/raw/markets` uses camelCase `account.targetCustody` / `account.side` (not `target_custody`).
- The `markets` view is built from `/pool-data` alone: `pools[].marketStats[]` gives `targetSymbol` + `side` + `openInterestUsd`; `pools[].custodyStats[]` gives each `symbol`'s `maxLeverage`. No `/raw/markets` join needed.
