# flash-cli

Rust CLI for **Flash Trade V2** — the perpetuals DEX running on a [MagicBlock](https://magicblock.gg) Ephemeral Rollup ("perps at 50 ms"). This CLI is a **REST client with local signing**: it calls the hosted V2 API (`https://flashapi.trade`) for reads and unsigned transaction building, signs locally with your keypair, and routes each transaction to the correct chain. There is no SDK, no on-chain instruction building, and nothing from V1.

## How V2 works (read this first)

- **Two chains.** Trading (open/close/collateral/triggers/limits) submits to the **Ephemeral Rollup** RPC. Account setup and withdrawals submit to the **base-chain** Solana RPC. Submitting to the wrong chain fails to land — the CLI routes for you and every transaction prints which chain it targets.
- **Baskets + deposit ledger.** Your positions and orders live in a per-wallet **basket** PDA, funded from a **deposit ledger**. Both are created once, in order, before you can trade.
- **Partially-signed transactions.** The API returns transactions with its own signer slots pre-filled and the blockhash already chosen for the target chain. The CLI adds **only your signature** and never touches the blockhash (that would invalidate the server's). Blockhashes expire in ~60 s — sign promptly.
- **Nothing submits without `--submit`.** Every transaction command prints the unsigned base64 by default. Add `--submit` to sign and send with your active key. **Mainnet, real funds.**

## Prerequisites

- [Rust](https://rustup.rs) (stable)
- A Solana keypair (only needed to sign; reads and quotes work without one)

## Install

```bash
cargo build --release
# Binary at target/release/flash
```

## Quick start

```bash
# Reads need no wallet:
flash health                     # API status + which pool config is live
flash prices                     # all live oracle prices
flash price SOL --watch          # one symbol, refreshing every 5s
flash markets                    # symbol / side / max leverage / open interest / pool
flash tokens                     # symbols + MINT addresses (deposits need mints)

# A free quote — no wallet needed (`--key none` = no real key, so it stays quote-only):
flash --key none perps open SOL long 11 5

# Import a wallet to sign:
flash keys add main --file ~/.config/solana/id.json
flash keys use main

# One-time account setup (base chain), in order — each is a separate approval:
flash setup init-basket   --submit
flash setup init-ledger   --submit
flash setup delegate      --submit
flash setup deposit USDC 25 --submit
flash setup status               # see how far setup has progressed

# Trade (Ephemeral Rollup):
flash perps open SOL long 11 5 --submit          # 5x long, $11 USDC collateral
flash perps tp-sl SOL long 0.5 --tp 120 --sl 60 --submit
flash account                                    # positions (mark-price PnL) + orders
flash perps close SOL long --submit              # full close (usd defaults to "0")

# Withdraw (base chain, two steps):
flash withdraw request USDC 20 --submit
# ...wait ~30–90s for settlement to cross the rollup...
flash withdraw execute USDC --submit
```

## Command reference

Global flag: `--key <name>` selects a keypair from the keystore for this run (overrides the active key).

### Reads (no wallet needed)

| Command | Description |
|---|---|
| `flash health` | API status, program, live pool-config env/version, account counts |
| `flash tokens [SYMBOL]` | Tokens with **mint** addresses + stable/virtual/Token-2022 flags |
| `flash price <SYMBOL> [--watch]` | One live oracle price (optionally refreshing every 5 s) |
| `flash prices` | All live oracle prices with market session |
| `flash markets` | Symbol, side, max-leverage cap, open interest, pool |
| `flash account [OWNER]` | Setup status + positions (mark-price PnL) + orders (defaults to your key) |

### `flash setup` — one-time account lifecycle (base chain)

Runs in order; the on-chain program enforces the sequence.

| Command | Description |
|---|---|
| `setup status [OWNER]` | Show how far setup has progressed |
| `setup init-basket --submit` | Step 1 — create the basket PDA |
| `setup init-ledger --submit` | Step 2 — create the deposit ledger |
| `setup delegate --submit` | Step 3 — delegate the basket to the MagicBlock validator |
| `setup deposit <TOKEN> <AMOUNT> --submit` | Step 4 — fund collateral (takes a symbol, resolved to its mint) |

### `flash perps` — trading (Ephemeral Rollup)

| Command | Description |
|---|---|
| `perps open <SYMBOL> <long\|short> <COLLATERAL_USD> <LEVERAGE> [--collateral-token USDC]` | Open or increase (or quote, if no wallet) |
| `perps close <SYMBOL> <long\|short> [--usd 0] [--withdraw-token USDC]` | Close; `usd 0` or ≥97% of size = full close |
| `perps reverse <SYMBOL> <long\|short> <LEVERAGE>` | Flip long↔short atomically (2% haircut on proceeds) |
| `perps add-collateral <SYMBOL> <long\|short> <AMOUNT> [--token USDC]` | Add collateral (lowers leverage) |
| `perps remove-collateral <SYMBOL> <long\|short> <USD> [--token USDC]` | Remove collateral (raises leverage) |
| `perps tp-sl <SYMBOL> <long\|short> <SIZE> [--tp PRICE] [--sl PRICE]` | Place a TP and/or SL bracket in one transaction |
| `perps trigger …` | Trigger-order management (below) |
| `perps limit …` | Limit-order management (below) |

`perps trigger`:

| Command | Description |
|---|---|
| `trigger place <SYMBOL> <SIDE> <PRICE> <SIZE> [--stop-loss]` | Place one TP (default) or SL |
| `trigger edit <SYMBOL> <SIDE> <ORDER_ID> <PRICE> <SIZE> [--stop-loss]` | Edit a slot — **both** price and size required |
| `trigger cancel <SYMBOL> <SIDE> <ORDER_ID> [--stop-loss]` | Cancel one slot (0–4), or `255` = all |
| `trigger cancel-all <SYMBOL> <SIDE>` | Cancel all triggers for a market + side |

`perps limit`:

| Command | Description |
|---|---|
| `limit edit <SYMBOL> <SIDE> <ORDER_ID> [--price P] [--size S]` | Edit a resting limit order — omitted fields keep existing |
| `limit cancel <SYMBOL> <SIDE> <ORDER_ID>` | Cancel a resting limit order |

### `flash withdraw` — withdrawals (base chain, two steps)

| Command | Description |
|---|---|
| `withdraw request <TOKEN> <AMOUNT> --submit` | Step 1 — escrow + schedule settlement (symbol → mint) |
| `withdraw execute <TOKEN> --submit` | Step 2 — move settled funds to the wallet (retry if `0xbc4`) |

### `flash keys` — wallet management

| Command | Description |
|---|---|
| `keys list` | List saved keypairs (marks the active one) |
| `keys generate <name>` | Generate a new keypair |
| `keys add <name> [--file PATH]` | Import from a keypair file; with no `--file`, imports the Solana CLI default (`~/.config/solana/id.json`) |
| `keys use <name>` | Set the active keypair |
| `keys show <name>` | Print the public key |
| `keys delete <name>` | Remove a keypair |

### `flash config` — settings

| Command | Description |
|---|---|
| `config list` | Show settings + the resolved two-chain network |
| `config set <key> <value>` | Update a setting |
| `config reset` | Reset settings to defaults |

## Configuration

The API base and both RPCs come from the environment, with verified defaults:

| Variable | Default | Used for |
|---|---|---|
| `FLASH_API_URL` | `https://flashapi.trade` | REST reads + transaction building (root; the `/v2` edge prefix is not deployed) |
| `ER_RPC_URL` | `https://flash.magicblock.xyz` | Trading transaction submission (Ephemeral Rollup) |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Setup + withdrawal submission (base chain) |

If `SOLANA_RPC_URL` is unset, a `rpc_url` you set with `flash config set rpc_url <url>` is used for the base chain instead. Run `flash config list` to see the resolved network.

Settings and keypairs live under a platform-specific directory:

| Platform | Config dir |
|---|---|
| macOS | `~/Library/Application Support/flash/` |
| Linux | `~/.config/flash/` (or `$XDG_CONFIG_HOME/flash/`) |
| Windows | `%APPDATA%\flash\` |

Keypairs are `keys/<name>.json` with `0o600` permissions (directory `0o700`); settings are `settings.json` (`0o600`). Locations are resolved via the [`dirs`](https://docs.rs/dirs/5/dirs/fn.config_dir.html) crate.

## Error channels

The API reports failures four ways; the CLI surfaces each with a tag:

- `[body-err]` — a trading/preview call returned HTTP 200 with a non-empty `err` (e.g. insufficient collateral).
- `[http-400]` — a trigger/limit price is invalid vs the oracle.
- `[http-422]` — a required field is missing or malformed.
- `[http-500]` — a setup/withdrawal server error (verify you passed a token **mint**, the lifecycle order, and a matching pool).

`execute-withdrawal` failing with `0xbc4 / AccountNotInitialized(settlement_receipt)` is a **timing state** (~30–90 s after `request`), not a failure — wait and re-run; execute is safe to retry.

## Security

The CLI handles Solana private keys locally. Understand these before using real funds.

**Key storage.** Keypairs are stored as **unencrypted JSON** in the platform config dir, protected by Unix permissions (`0o600`) — the same pattern as the Solana CLI. Anyone with filesystem access to your user account can read them; there is no encryption at rest and no OS-keychain integration.

**Recommendations:**
- Use a dedicated keypair with limited funds — do not import your main wallet.
- Verify permissions on the keys directory (`-rw-------` per key file).
- On shared machines, use full-disk encryption. For large amounts, use a hardware wallet with the Flash Trade web UI instead.

**Importing keys.** Prefer `keys add <name> --file /path/to/keypair.json` or `keys generate <name>`. The CLI never accepts a raw private key as a command-line argument (which would leak it to shell history and the process list).

**RPC.** The CLI submits signed transactions to the configured RPCs. A malicious RPC could capture/replay your transactions or return false data. Use a trusted provider (Helius, Triton, QuickNode). If your RPC URL embeds an API key, note that `flash config set rpc_url <url>` lands it in your shell history — consider clearing it afterward. `settings.json` may contain that key and is written `0o600`; `config list` redacts query strings.

**What the CLI does right:** keys never leave your machine (all signing is local); only public keys are ever printed; it adds only your signature and never rewrites the server's blockhash.

## Important notes

- **Minimum collateral >$10 after fees.** Limit/TP/SL require more than $10 collateral once entry fees are deducted — open with at least $11.
- **Mainnet only.** Oracle prices are mainnet; the public surface is mainnet.
- **`env=dev` spreads.** If `flash health` shows `env=dev`, that deployment may carry test spreads (~10% on some markets). PnL and liquidation are computed from the live **mark** price (not the spread-distorted indexer value).
- **Reverse haircut.** `perps reverse` applies a fixed 2% haircut to close proceeds before sizing the new side.

## Development

```bash
cargo build            # debug
cargo build --release  # release
cargo test             # unit + inline tests (offline); RUN_INTEGRATION=1 adds live read-only smoke
cargo clippy           # lint (clean)
```

### Architecture

```
src/
  main.rs              # binary entry — parses clap, resolves the network, dispatches
  lib.rs               # library root — modules shared by the binary and the tests
  cli/                 # clap command definitions (the whole V2 command tree)
  commands/            # handlers: reads.rs (read views) + txn.rs (build → print/submit)
  core/
    api.rs             # typed REST client — 4 error channels, DTOs (mint, youRecieveUsdUi verbatim)
    network.rs         # two-chain routing table (chain_for) + RPC resolution
    signer.rs          # decode → add owner signature → submit to the right chain
    compute.rs         # mark-price PnL / leverage / liquidation (GOTCHAS §20)
    config.rs          # settings + platform config dir
    wallet.rs          # keystore (0o600 keys)
  output/colors.rs     # price/USD/PnL formatting
  error.rs             # unified error type (four API channels)
tests/
  unit/                # routing table, API DTOs, mark-price math, config, wallet
  integration/         # live read-only smoke (opt-in via RUN_INTEGRATION=1)
```

### Dependencies

- `solana-sdk` / `solana-client 2.2` — local signing + RPC submission (the **only** on-chain surface)
- `reqwest 0.12` (rustls) — REST client
- `clap 4` (derive) — CLI framework
- `tokio 1` — async runtime
- `base64` / `bincode` — decode partially-signed transactions

There is no `flash-sdk`, `anchor-lang`, or Hermes/Pyth dependency — the hosted API owns instruction building and pricing.
