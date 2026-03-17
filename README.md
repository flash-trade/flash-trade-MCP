<div align="center">

# ⚡ Flash Trade CLI

**Trade perpetuals, earn yield, and manage your portfolio on [Flash Trade](https://flash.trade) from the command line.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Runtime-Bun_1.0+-f9f1e1?logo=bun)](https://bun.sh)
[![Solana](https://img.shields.io/badge/Blockchain-Solana-9945FF?logo=solana)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/Tests-61_passing-brightgreen)]()
[![Commands](https://img.shields.io/badge/Commands-38-blueviolet)]()

<br />

<img src="https://flash.trade/logo.svg" alt="Flash Trade" width="80" />

<br />

**38 commands** · **Local signing** · **Live Pyth prices** · **Table + JSON output** · **Dry-run mode**

[Setup](#-setup) · [Quick Start](#-quick-start) · [All Commands](#-all-commands) · [For Developers](#-for-developers)

</div>

---

## 📦 Setup

### Step 1 — Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

> Close and reopen your terminal after installing.

### Step 2 — Clone and install

```bash
git clone <repo-url>
cd flash-cli
bun install
```

### Step 3 — Verify it works

```bash
bun run dev perps markets --pool Crypto.1
```

You should see a table of markets with live prices. That's it — you're set up.

> **One-command setup:** `bash scripts/setup.sh` handles everything including wallet creation.

---

## 🔑 Wallet Setup

You need a Solana wallet to trade. Pick one:

<details>
<summary><b>Option A:</b> Generate a new wallet</summary>

```bash
bun run dev keys add mywallet --encryption none
```

⚠️ **Write down the seed phrase** — you won't see it again.

</details>

<details>
<summary><b>Option B:</b> Import your existing Solana wallet</summary>

```bash
bun run dev keys import mywallet ~/.config/solana/id.json
```

</details>

Your wallet is now ready. The CLI automatically uses it for all commands.

---

## 🌐 RPC Endpoint (Free)

The CLI works with Solana's public RPC, but it's slow. Get a free RPC from **Helius** for a much better experience:

1. Go to **[helius.dev](https://www.helius.dev)** and sign up (free — 100K requests/day)
2. Copy your RPC URL from the dashboard
3. Set it in the CLI:

```bash
bun run dev config set rpcUrl https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

---

## 🚀 Quick Start

### See what's available to trade

```bash
bun run dev perps markets
```

### Check your wallet balance

```bash
bun run dev spot portfolio
```

### Open a trade

```bash
bun run dev perps open --asset SOL --side long --amount 10 --leverage 5
```

> Opens a $50 position (10 USDC × 5x leverage) betting SOL goes up.

### Check your open positions

```bash
bun run dev perps positions
```

### Set take-profit and stop-loss

```bash
bun run dev perps set --asset SOL --side long --take-profit 120 --stop-loss 80
```

### Close a trade

```bash
bun run dev perps close --asset SOL --side long
```

### Earn yield on your USDC

```bash
bun run dev earn deposit --pool Crypto.1 --amount 100 --token USDC
```

---

## 🔄 Devnet vs Mainnet

| | Devnet | Mainnet |
|---|--------|---------|
| **Money** | Fake (test tokens) | Real |
| **Use for** | Testing | Trading |
| **Prices** | May show $0 | Live Pyth feeds |

```bash
# Switch to devnet (testing)
bun run dev config set cluster devnet

# Switch to mainnet (real trading)
bun run dev config set cluster mainnet-beta

# Get free test SOL on devnet
bun run dev airdrop claim --amount 2
```

---

## 📋 All Commands

### Perpetual Trading

| Command | What it does |
|---------|-------------|
| `perps markets` | List all markets with live prices |
| `perps positions` | Show your open positions with PnL |
| `perps orders` | Show your open TP/SL and limit orders |
| `perps open --asset SOL --side long --amount 10 --leverage 5` | Open a position |
| `perps close --asset SOL --side long` | Close a position |
| `perps set --asset SOL --side long --take-profit 120` | Set take-profit |
| `perps set --asset SOL --side long --stop-loss 80` | Set stop-loss |
| `perps set --asset SOL --side long --add-collateral 5` | Add collateral |
| `perps set --asset SOL --side long --remove-collateral 5` | Remove collateral |
| `perps limit --asset SOL --side short --amount 10 --leverage 5 --price 100` | Place limit order |
| `perps cancel --asset SOL --side short` | Cancel an order |
| `perps history` | View trade history |

### Yield / Liquidity

| Command | What it does |
|---------|-------------|
| `earn pools` | Show pool stats and TVL |
| `earn deposit --pool Crypto.1 --amount 100 --token USDC` | Add liquidity |
| `earn withdraw --pool Crypto.1 --amount 100 --output-token USDC` | Remove liquidity |
| `earn stake --pool Crypto.1` | Stake FLP tokens |
| `earn unstake --pool Crypto.1 --instant` | Unstake FLP tokens |
| `earn claim --pool Crypto.1` | Claim yield rewards |
| `earn convert --pool Crypto.1 --from sflp --to cflp --amount 50` | Convert between FLP types |

### Spot

| Command | What it does |
|---------|-------------|
| `spot tokens` | List tokens with prices |
| `spot portfolio` | Show wallet balances |
| `spot quote --from SOL --to USDC --amount 1` | Get a swap quote |
| `spot swap --from USDC --to SOL --amount 10` | Execute a swap (devnet) |

### FAF Token Staking

| Command | What it does |
|---------|-------------|
| `faf status` | Show staked amount and VIP tier |
| `faf deposit --amount 1000` | Stake FAF for fee discounts |
| `faf unstake --amount 500` | Request unstake |
| `faf cancel-unstake` | Cancel pending unstake |
| `faf withdraw` | Withdraw after cooldown |
| `faf claim` | Claim staking rewards |
| `faf claim-revenue` | Claim USDC revenue share |

### Rewards & Utilities

| Command | What it does |
|---------|-------------|
| `rewards claim` | Claim raffle/distribution rewards |
| `rewards history` | View reward history |
| `airdrop claim --amount 2` | Get devnet SOL (devnet only) |
| `config list` | Show all settings |
| `config set cluster devnet` | Change a setting |
| `keys list` | Show stored wallets |
| `keys add mykey` | Create a new wallet |
| `keys import mykey ~/.config/solana/id.json` | Import existing wallet |

> **Tip:** All commands are prefixed with `bun run dev` when running from source.

---

## ⚙️ Global Options

Add these to any command:

| Flag | What it does |
|------|-------------|
| `--output json` | Machine-readable JSON output |
| `--dry-run` | Simulate without sending a transaction |
| `--yes` | Skip confirmation prompts |
| `--key <name>` | Use a specific wallet |
| `--address <pubkey>` | Read-only: view any wallet's data |
| `--cluster <net>` | Override network (mainnet-beta / devnet) |
| `--rpc <url>` | Override RPC endpoint |

---

## 🤖 For AI Agents & Bots

All commands support JSON output for machine-readable parsing:

```bash
# Get positions as JSON
bun run dev --output json perps positions

# Open a trade non-interactively
bun run dev --output json --yes perps open --asset SOL --side long --amount 10 --leverage 5

# Simulate before sending
bun run dev --output json --dry-run perps open --asset ETH --side short --amount 20 --leverage 10
```

See [CLAUDE.md](./CLAUDE.md) for architecture details, SDK integration patterns, and coding guidelines.

---

## 🛠 For Developers

```bash
bun run dev          # Run from source
bun run ci           # Lint + typecheck + test
bun test             # Unit tests only (61 tests)
bun run build        # Compile ESM bundle
bun run build:binary # Standalone binaries for all platforms
bun run day0         # Verify Bun + flash-sdk compatibility
```

### Project Structure

```
src/
├── index.ts              # Entry point — Commander setup
├── commands/             # 8 command groups (38 subcommands)
│   ├── PerpsCommand.ts   # Perpetual trading
│   ├── EarnCommand.ts    # FLP yield operations
│   ├── SpotCommand.ts    # Token swaps & portfolio
│   ├── FafCommand.ts     # FAF staking & VIP tiers
│   ├── KeysCommand.ts    # Wallet management
│   ├── ConfigCommand.ts  # Settings
│   ├── RewardsCommand.ts # Raffle rewards
│   └── AirdropCommand.ts # Devnet faucet
├── lib/                  # Core libraries
│   ├── FlashClient.ts    # flash-sdk wrapper
│   ├── TxExecutor.ts     # Transaction pipeline
│   ├── PriceService.ts   # Pyth oracle prices
│   ├── ErrorHandler.ts   # 52+ error codes
│   ├── KeyEncryption.ts  # 3-tier key security
│   └── ...               # Config, Output, Signer, etc.
└── types/
    └── index.ts          # TypeScript interfaces
```

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| **"No active key set"** | `bun run dev keys add mykey --encryption none` |
| **Prices show $0.00** | You're on devnet. Switch: `bun run dev config set cluster mainnet-beta` |
| **"Simulation failed"** | Usually insufficient balance. Check: `bun run dev spot portfolio` |
| **Commands are slow** | Get a free Helius RPC: [helius.dev](https://www.helius.dev) |
| **"Slippage exceeded"** | Increase tolerance: `bun run dev config set slippageBps 200` |
| **Transaction expired** | Network congestion. Try again. |

---

<div align="center">

**Built with [flash-sdk](https://www.npmjs.com/package/flash-sdk) · Powered by [Solana](https://solana.com) · Prices from [Pyth](https://pyth.network)**

</div>
