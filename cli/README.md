# flash-cli

Rust CLI for [Flash Trade](https://flash.trade) perpetual DEX on Solana. Uses the flash-sdk directly for on-chain instruction building with local transaction signing.

## Prerequisites

- [Rust](https://rustup.rs) (stable)
- A Solana keypair (file or base58 private key)
- RPC endpoint (default: `https://api.mainnet-beta.solana.com`)

## Install

```bash
cargo build --release
# Binary at target/release/flash
```

## Quick Start

```bash
# Import your wallet
flash keys add main --file ~/.config/solana/id.json
flash keys use main

# Check a price
flash price SOL

# View available markets
flash perps markets

# View your positions
flash perps positions

# Open a position: 5x long SOL with $20 USDC collateral
flash perps open SOL long 20 --leverage 5

# Set a take-profit at $200
flash orders trigger <POSITION_PUBKEY> --type tp --price 200

# Close the position
flash perps close <POSITION_PUBKEY>
```

## Commands

### `flash perps` — Trading

| Command | Description | Example |
|---------|-------------|---------|
| `markets` | List available markets | `flash perps markets` |
| `market <symbol>` | Market detail | `flash perps market SOL` |
| `positions` | List your open positions | `flash perps positions` |
| `position <pubkey>` | Single position detail | `flash perps position <PUBKEY>` |
| `portfolio` | Aggregated position summary | `flash perps portfolio` |
| `open` | Open a new position | `flash perps open SOL long 20 --leverage 5` |
| `close` | Close a position (full or partial) | `flash perps close <PUBKEY> --percent 50` |
| `increase` | Increase position size | `flash perps increase <PUBKEY> 10` |
| `decrease` | Decrease position size | `flash perps decrease <PUBKEY> 10` |
| `add-collateral` | Add collateral (reduce leverage) | `flash perps add-collateral <PUBKEY> 5` |
| `remove-collateral` | Remove collateral (increase leverage) | `flash perps remove-collateral <PUBKEY> 5` |

### `flash orders` — Order Management

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all orders | `flash orders list` |
| `limit` | Place a limit order | `flash orders limit SOL long 50 --price 120 --leverage 3` |
| `edit-limit` | Edit a limit order | `flash orders edit-limit <PUBKEY> --price 125` |
| `trigger` | Place TP or SL | `flash orders trigger <PUBKEY> --type tp --price 200` |
| `edit-trigger` | Edit a trigger order | `flash orders edit-trigger <PUBKEY> --price 210` |
| `cancel` | Cancel a single order | `flash orders cancel <PUBKEY>` |
| `cancel-all` | Cancel all orders for a market | `flash orders cancel-all SOL` |

### `flash earn` — Liquidity & Staking

| Command | Description | Example |
|---------|-------------|---------|
| `pools` | List all liquidity pools | `flash earn pools` |
| `pool <name>` | Pool detail (AUM, APY, ratios) | `flash earn pool Crypto.1` |
| `add-liquidity` | Deposit into a pool | `flash earn add-liquidity Crypto.1 USDC 100` |
| `remove-liquidity` | Withdraw from a pool | `flash earn remove-liquidity Crypto.1 USDC 50` |
| `stake` | Stake FLP tokens | `flash earn stake Crypto.1 100` |
| `unstake` | Unstake FLP tokens | `flash earn unstake Crypto.1 100 --instant` |
| `claim` | Collect staking rewards | `flash earn claim Crypto.1` |
| `stakes` | View stake positions | `flash earn stakes` |

### `flash keys` — Wallet Management

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List saved keypairs | `flash keys list` |
| `add` | Import a keypair | `flash keys add main --file ~/.config/solana/id.json` |
| `delete` | Remove a keypair | `flash keys delete old-wallet` |
| `use` | Set active keypair | `flash keys use main` |
| `show` | Show public key | `flash keys show main` |
| `generate` | Generate new keypair | `flash keys generate trading` |

### `flash config` — Settings

| Command | Description | Example |
|---------|-------------|---------|
| `list` | Show all settings | `flash config list` |
| `set` | Update a setting | `flash config set rpc_url https://my-rpc.com` |
| `reset` | Reset to defaults | `flash config reset` |

Settings: `cluster`, `output_format`, `rpc_url`, `default_slippage_bps`, `priority_fee`

### Other

| Command | Description | Example |
|---------|-------------|---------|
| `price <symbol>` | Get current price | `flash price SOL` |
| `price <symbol> --watch` | Live price updates (5s) | `flash price BTC --watch` |
| `version` | Show CLI and SDK versions | `flash version` |

## Global Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--format <table\|json>` | Output format | `table` |
| `--cluster <mainnet\|devnet>` | Solana cluster | `mainnet` |
| `--key <name>` | Keypair name from keystore | active key |

## Configuration

Config and keypairs live under a platform-specific directory:

| Platform | Config dir |
|----------|-----------|
| macOS    | `~/Library/Application Support/flash/` |
| Linux    | `~/.config/flash/` (or `$XDG_CONFIG_HOME/flash/`) |
| Windows  | `%APPDATA%\flash\` |

Settings are in `settings.json`; keypairs are in `keys/<name>.json` with `0o600` permissions (directory `0o700`). The actual location is resolved via the [`dirs`](https://docs.rs/dirs/5/dirs/fn.config_dir.html) crate at runtime.

## Security Considerations

This CLI handles Solana private keys locally. Understand these risks before using it with real funds.

### Key Storage

Keypairs are stored as **unencrypted JSON** in the platform config dir (see [Configuration](#configuration) above), protected by Unix file permissions (`0o600`). This follows the same pattern as the Solana CLI (`~/.config/solana/id.json`).

**Risks:**
- If file permissions are changed (e.g., by a backup tool, `chmod`, or file copy), keys become readable by other users on shared systems
- No encryption at rest — anyone with filesystem access to your user account can read the keys
- No OS keychain integration (macOS Keychain, Linux secret-service)

**Recommendations:**
- Use a dedicated keypair with limited funds for trading — do not import your main wallet
- Verify permissions on the keys directory (path is platform-specific — see [Configuration](#configuration)):
  - macOS: `ls -la "$HOME/Library/Application Support/flash/keys/"`
  - Linux: `ls -la ~/.config/flash/keys/`
  - Both should show `-rw-------` on each key file
- On shared machines, consider full-disk encryption
- For large amounts, use a hardware wallet with the Flash Trade web UI instead

### Private Key Import

The `--private-key` flag passes your base58 key as a CLI argument:

```bash
# AVOID THIS — key is visible in shell history and process list
flash keys add main --private-key <base58-key>
```

**Safer alternatives:**
- Import from file: `flash keys add main --file /path/to/keypair.json`
- Generate a fresh key: `flash keys generate trading`
- After importing via `--private-key`, clear your shell history: `history -c` (bash) or `fc -p` (zsh)

### RPC Configuration

The CLI sends signed transactions to the configured RPC endpoint. A compromised or malicious RPC URL could:
- Capture your signed transactions and replay or front-run them
- Return false data (fake prices, positions)

**Recommendations:**
- Use a trusted RPC provider (Helius, Triton, QuickNode)
- If your RPC URL contains an API key, be aware it is stored in `settings.json` under the platform config dir (see [Configuration](#configuration)). The file is written with `0o600` permissions, but setting it via `flash config set rpc_url <url>` still lands the URL (with the key) in your shell history — consider `history -c` afterward.
- Avoid setting RPC URLs from untrusted sources

### Config File

`settings.json` (in the platform config dir — see [Configuration](#configuration)) stores your active key name, RPC URL, cluster, and preferences. This file may contain RPC API keys embedded in URLs and is written with `0o600` permissions.

### What the CLI Does Right

- Private keys **never leave your machine** — all signing is local
- Private keys are **never logged or printed** — only public keys appear in output
- Fresh blockhash fetched per transaction — prevents stale transaction replay
- Key files created with `0o600` permissions, key directory with `0o700`

## Important Notes

- **Minimum collateral >$10**: TP/SL/limit orders require more than $10 collateral after fees. Use at least $11-12.
- **Mainnet only**: Pyth oracle prices are mainnet only. Devnet returns stale/zero.
- **SOL positions use JitoSOL** as underlying collateral on-chain.
- **Default slippage**: 100 bps (1%). Override with `--slippage`.

## Development

```bash
cargo build            # Debug build
cargo build --release  # Release build
cargo test             # Run all tests
cargo clippy           # Lint
```

### Architecture

```
src/
  main.rs              # Entry point
  cli/                 # Clap derive command definitions
  commands/            # Command handlers (one file per command)
  core/                # Infrastructure: wallet, config, RPC, prices, tx engine
  enrichment/          # PnL, leverage, liquidation calculations
  output/              # Table and JSON formatters
  error.rs             # Unified error types
```

### Key Dependencies

- `flash-sdk` — On-chain instruction builders, pool configs, calculations
- `anchor-lang 0.32.1` — Program type generation
- `solana-sdk/client 2.2` — RPC, transactions, keypairs
- `clap 4` — CLI framework (derive macros)
- `tokio 1` — Async runtime
