# Flash Trade CLI

Trade perpetuals, earn yield, and manage your portfolio on [Flash Trade](https://flash.trade) from the command line.

---

## Setup

### Step 1: Install Bun

Bun is the JavaScript runtime that runs this CLI. Open your terminal and paste:

```bash
curl -fsSL https://bun.sh/install | bash
```

Close and reopen your terminal after installing.

### Step 2: Download the project

```bash
git clone <repo-url>
cd flash-cli
```

### Step 3: Install dependencies

```bash
bun install
```

This takes about 5 seconds. You're now ready to use the CLI.

### Step 4: Try it out

```bash
bun run dev perps markets --pool Crypto.1
```

You should see a table of markets with live prices. If you do, everything is working.

---

## Setting up a wallet

You need a Solana wallet to trade. You have two options:

**Option A: Generate a new one**

```bash
bun run dev keys add mywallet --encryption none
```

This creates a new wallet and saves it securely. Write down the seed phrase — you won't see it again.

**Option B: Import your existing Solana wallet**

If you already have a Solana CLI keypair:

```bash
bun run dev keys import mywallet ~/.config/solana/id.json
```

Either way, your wallet is now ready. The CLI automatically uses it for all commands.

---

## Getting a better RPC endpoint (free)

The CLI works out of the box with Solana's public RPC, but it's slow and rate-limited. For a better experience, get a free RPC from Helius:

1. Go to [https://www.helius.dev](https://www.helius.dev)
2. Sign up (free tier gives you 100K requests/day)
3. Copy your RPC URL from the dashboard
4. Set it in the CLI:

```bash
bun run dev config set rpcUrl https://mainnet.helius-rpc.com/?api-key=YOUR_KEY_HERE
```

---

## Common commands

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

This opens a $50 position (10 USDC × 5x leverage) betting SOL goes up.

### Check your open positions

```bash
bun run dev perps positions
```

### Set a take-profit and stop-loss

```bash
bun run dev perps set --asset SOL --side long --take-profit 120 --stop-loss 80
```

### Close a trade

```bash
bun run dev perps close --asset SOL --side long
```

### Add liquidity to earn yield

```bash
bun run dev earn deposit --pool Crypto.1 --amount 100 --token USDC
```

### Check pool yields

```bash
bun run dev earn pools
```

---

## Switching between devnet and mainnet

**Devnet** is for testing with fake money. **Mainnet** is real money.

```bash
# Switch to devnet (testing)
bun run dev config set cluster devnet

# Switch to mainnet (real trading)
bun run dev config set cluster mainnet-beta
```

When on devnet, you can get free test SOL:

```bash
bun run dev airdrop claim --amount 2
```

---

## Using JSON output (for bots and scripts)

Add `--output json` to any command for machine-readable output:

```bash
bun run dev --output json perps positions
```

Add `--yes` to skip confirmation prompts in automated scripts:

```bash
bun run dev --output json --yes perps open --asset SOL --side long --amount 10 --leverage 5
```

---

## Simulate before sending (dry run)

Want to see what a trade would do without actually sending it?

```bash
bun run dev --dry-run perps open --asset SOL --side long --amount 10 --leverage 5
```

If the simulation passes, the trade would have worked. No money is spent.

---

## All commands

| What you want to do | Command |
|---------------------|---------|
| **See markets** | `perps markets` |
| **See your positions** | `perps positions` |
| **Open a trade** | `perps open --asset SOL --side long --amount 10 --leverage 5` |
| **Close a trade** | `perps close --asset SOL --side long` |
| **Set take-profit** | `perps set --asset SOL --side long --take-profit 120` |
| **Set stop-loss** | `perps set --asset SOL --side long --stop-loss 80` |
| **Place a limit order** | `perps limit --asset SOL --side short --amount 10 --leverage 5 --price 100` |
| **Cancel an order** | `perps cancel --asset SOL --side short` |
| **View trade history** | `perps history` |
| **See your wallet** | `spot portfolio` |
| **Get a swap quote** | `spot quote --from SOL --to USDC --amount 1` |
| **List tokens** | `spot tokens` |
| **See pool yields** | `earn pools` |
| **Deposit into a pool** | `earn deposit --pool Crypto.1 --amount 100 --token USDC` |
| **Withdraw from a pool** | `earn withdraw --pool Crypto.1 --amount 100 --output-token USDC` |
| **Stake FLP** | `earn stake --pool Crypto.1` |
| **Unstake FLP** | `earn unstake --pool Crypto.1 --instant` |
| **Claim yield** | `earn claim --pool Crypto.1` |
| **See FAF tier** | `faf status` |
| **Stake FAF** | `faf deposit --amount 1000` |
| **Claim FAF rewards** | `faf claim` |
| **Claim revenue** | `faf claim-revenue` |
| **See settings** | `config list` |
| **Change a setting** | `config set cluster devnet` |
| **See your keys** | `keys list` |
| **Create a key** | `keys add mykey` |
| **Import a key** | `keys import mykey ~/.config/solana/id.json` |

> All commands are prefixed with `bun run dev` when running from source.

---

## Troubleshooting

**"No active key set"** — Run `bun run dev keys add mykey --encryption none` then `bun run dev keys use mykey`

**Prices show $0.00** — You're on devnet. Devnet tokens don't have real Pyth price feeds. Switch to mainnet for real prices: `bun run dev config set cluster mainnet-beta`

**"Simulation failed"** — Usually means insufficient balance. Check your wallet: `bun run dev spot portfolio`

**Commands are slow** — You're using the public RPC. Get a free Helius key: [helius.dev](https://www.helius.dev)

**"Slippage exceeded"** — Increase slippage tolerance: `bun run dev config set slippageBps 200` (2%)

---

## For developers

```bash
bun run dev          # Run from source
bun run ci           # Lint + typecheck + test
bun test             # Unit tests
bun run build        # Compile ESM bundle
bun run build:binary # Standalone binaries for all platforms
bun run day0         # Verify runtime compatibility
```

See [CLAUDE.md](./CLAUDE.md) for architecture details and coding patterns.

## License

MIT
