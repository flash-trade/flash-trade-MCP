# flash-cli — CLAUDE.md

Guidance for Claude Code working in `cli/`. This is the **V2-only** Flash Trade CLI: a REST client against the hosted V2 API with local signing and two-chain routing. **No SDK, no on-chain instruction building, no V1** — the private `flash-sdk` git dep, `anchor-lang`, and Hermes pricing were removed. Do not reintroduce them.

## Build & test

```bash
cargo build                    # debug
cargo test                     # unit + inline tests (offline)
RUN_INTEGRATION=1 cargo test   # + live read-only smoke against mainnet
cargo clippy --all-targets     # lint — keep it clean (0 warnings)
cargo run -- --help
```

## Architecture

The crate is a library (`src/lib.rs`) plus a thin binary (`src/main.rs`) so the binary and the external tests share one definition of each module.

- `src/cli/` — clap command tree (`App` + `Command` + subcommand enums). One global flag: `--key`.
- `src/commands/`
  - `mod.rs` — `resolve_owner()` (explicit arg → active/override key) and `handle_built()` (print the unsigned tx + its chain, or with `--submit` sign and send).
  - `reads.rs` — read views (health, tokens, prices, price, markets, account).
  - `txn.rs` — every transaction-building command: build a JSON body → `api.build(path, body)` → print the API's preview → `handle_built`.
- `src/core/`
  - `api.rs` — typed REST client. One `get()`/`post()` funnel normalizes the **four error channels** and throws `err`-in-a-200. `build()`/`preview()` are generic over the endpoint path. DTOs mirror the live backend verbatim.
  - `network.rs` — **`chain_for(builder_path)`**: the single-source-of-truth routing table (trading → ER, setup/withdrawal → base). Asserted by `tests/unit/network_test.rs`.
  - `signer.rs` — the **only** place funds move: decode the base64 tx, add **only** the owner's signature (never touch the blockhash), submit to `network.rpc_for(chain)`, poll to confirm.
  - `compute.rs` — mark-price PnL/leverage/liquidation (GOTCHAS §20). Never surface the indexer's spread-distorted numbers.
  - `config.rs`, `wallet.rs` — settings + keystore (`0o600` keys). V1-agnostic; kept as-is.
- `src/output/colors.rs` — price/USD/PnL formatting.
- `src/error.rs` — `FlashCliError` with the four API channels + send/RPC errors.

## V2 domain knowledge (read before touching txn.rs)

### Two chains — the top failure mode
Trading txs (`open/close/reverse/collateral/triggers/limits/tp-sl`) submit to the **Ephemeral Rollup**; setup (`init-basket/init-deposit-ledger/delegate-basket/deposit-direct`) and withdrawal (`request/execute-withdrawal`) submit to the **base chain**. `chain_for()` is the routing table; `handle_built` tells the user which chain each tx targets. Wrong chain = fails to land.

### Partially-signed transactions
The API returns transactions with its signer slots pre-filled and the blockhash chosen for the target chain. `signer::partial_sign` fills **only** the owner's slot (found by pubkey position in `static_account_keys`) and never replaces the blockhash. Blockhashes expire ~60 s.

### Account lifecycle (one-time, in order)
`init-basket → init-deposit-ledger → delegate-basket → deposit-direct`, then trade. The program enforces the order; the API does not. Detect "not set up" via `flash account` / `setup status` (`basketPubkey == null`). The REST snapshot only exposes the basket PDA — it does not directly report whether the ledger exists or the basket is delegated, so `setup status` is honest about that.

### Mint vs symbol
`setup deposit`, `withdraw request`, `withdraw execute` need a token **mint** — the CLI resolves the symbol via `api.resolve_mint()` (from `/tokens`, which flags `isToken2022`). Every trading command takes a **symbol**.

### Four error channels
`[body-err]` (200 + non-empty `err`), `[http-400]` (trigger/limit price vs oracle), `[http-422]` (schema/missing field), `[http-500]` (setup/withdrawal, reason server-side only). `execute-withdrawal` → `0xbc4 / AccountNotInitialized(settlement_receipt)` is a ~30–90 s timing state, not a failure — retry.

### Sentinels & quirks (mirror verbatim)
- `trigger cancel … 255` cancels ALL triggers for the market + side.
- `edit-trigger` requires **both** price and size (no keep-existing); `edit-limit` treats omitted fields as keep-existing.
- The API field `youRecieveUsdUi` is genuinely misspelled — never "fix" it.
- `open` with no resolvable wallet returns a **quote only** (no `owner` in the body → no `transactionBase64`).

### Collateral & fees
Limit/TP/SL require >$10 collateral **after** entry fees — open with ≥$11. `reverse` applies a fixed 2% haircut to close proceeds.

## Conventions

- Amounts/prices are UI decimal strings at the API boundary — pass them through as strings; only `leverage` and `orderId` are JSON numbers.
- `--submit` is the gate: without it, transaction commands only print the unsigned base64. Never submit implicitly.
- Reads need no wallet. `account`/trading commands resolve the owner from the active key (or `--key`).
- Endpoints serve at ROOT (`https://flashapi.trade`); the `/v2` edge prefix is not deployed. Overrides: `FLASH_API_URL`, `ER_RPC_URL`, `SOLANA_RPC_URL`.
- Never read, echo, or reuse private-key bytes; only public keys are printed.
