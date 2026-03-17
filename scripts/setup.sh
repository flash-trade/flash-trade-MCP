#!/bin/bash
# Flash Trade CLI — One-command setup
# Usage: bash scripts/setup.sh
set -e

echo ""
echo "  Flash Trade CLI — Setup"
echo "  ─────────────────────────"
echo ""

# Check Bun
if ! command -v bun &> /dev/null; then
    echo "  Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    echo "  ✓ Bun installed"
else
    echo "  ✓ Bun $(bun --version) found"
fi

# Install dependencies
echo "  Installing dependencies..."
bun install --silent
echo "  ✓ Dependencies installed"

# Create config directory
mkdir -p ~/.config/flash/keys
echo "  ✓ Config directory created (~/.config/flash/)"

# Set default config if none exists
if [ ! -f ~/.config/flash/settings.json ]; then
    bun run src/index.ts config list > /dev/null 2>&1
    echo "  ✓ Default config created"
else
    echo "  ✓ Config already exists"
fi

# Check for Solana keypair
if [ -f ~/.config/solana/id.json ]; then
    echo ""
    echo "  Found Solana keypair at ~/.config/solana/id.json"
    read -p "  Import it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bun run src/index.ts keys import default ~/.config/solana/id.json --encryption none 2>/dev/null
        bun run src/index.ts keys use default 2>/dev/null
        echo "  ✓ Key imported as 'default'"
    fi
else
    echo ""
    echo "  No Solana keypair found."
    read -p "  Generate a new one? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bun run src/index.ts keys add default --encryption none
        echo "  ✓ Key generated as 'default'"
    fi
fi

echo ""
echo "  ─────────────────────────"
echo "  Setup complete! Try:"
echo ""
echo "    bun run dev perps markets"
echo ""
echo "  For faster RPC, get a free key at https://www.helius.dev"
echo "  Then run: bun run dev config set rpcUrl <your-helius-url>"
echo ""
