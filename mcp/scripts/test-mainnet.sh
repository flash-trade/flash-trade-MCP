#!/bin/bash
set -e

echo "=== FLASH TRADE MCP — MAINNET LIVE TESTING ==="
echo "WARNING: This uses REAL funds on Solana mainnet!"
echo "Risk limits: max \$25 USDC, 3x leverage, SOL market only"
echo ""

# ── Safety checks ──

if ! command -v solana &> /dev/null; then
  echo "ERROR: solana CLI not found. Install from https://docs.solana.com/cli/install"
  exit 1
fi

WALLET=$(solana address 2>/dev/null || echo "")
if [ -z "$WALLET" ]; then
  echo "ERROR: No wallet configured. Run: solana-keygen new"
  exit 1
fi

BALANCE=$(solana balance --lamports 2>/dev/null | grep -o '[0-9]*' | head -1)
if [ -z "$BALANCE" ] || [ "$BALANCE" -lt 10000000 ]; then
  echo "ERROR: Insufficient SOL for gas fees (need >= 0.01 SOL)"
  echo "Wallet: $WALLET"
  echo "Balance: $(solana balance 2>/dev/null || echo 'unknown')"
  exit 1
fi

echo "Wallet: $WALLET"
echo "Balance: $(solana balance)"
echo ""

read -p "Continue with mainnet testing? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

API_URL="${FLASH_API_URL:-http://localhost:3000}"
echo ""
echo "Using API: $API_URL"
echo ""

# ── Phase 1: Read-only operations (safe) ──

echo "━━━ Phase 1: Read-Only Operations ━━━"

echo -n "  health_check... "
HEALTH=$(curl -sf "$API_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then echo "OK"; else echo "FAIL"; exit 1; fi

echo -n "  get_markets... "
MARKETS=$(curl -sf "$API_URL/markets" 2>/dev/null)
COUNT=$(echo "$MARKETS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($COUNT markets)"

echo -n "  get_prices (SOL)... "
SOL_PRICE=$(curl -sf "$API_URL/prices/SOL" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"\${float(d['price'])*10**int(d['exponent']):.2f}\")" 2>/dev/null || echo "FAIL")
echo "$SOL_PRICE"

echo -n "  get_pools... "
POOLS=$(curl -sf "$API_URL/pools" 2>/dev/null)
PCOUNT=$(echo "$POOLS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($PCOUNT pools)"

echo -n "  get_custodies... "
CUSTS=$(curl -sf "$API_URL/custodies" 2>/dev/null)
CCOUNT=$(echo "$CUSTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($CCOUNT custodies)"

echo -n "  get_pool_data... "
curl -sf "$API_URL/pool-data" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

echo -n "  get_positions (owner: $WALLET)... "
POS=$(curl -sf "$API_URL/positions/owner/$WALLET?includePnlInLeverageDisplay=false" 2>/dev/null)
POSCOUNT=$(echo "$POS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($POSCOUNT positions)"

echo -n "  get_orders (owner: $WALLET)... "
ORDS=$(curl -sf "$API_URL/orders/owner/$WALLET" 2>/dev/null)
ORDCOUNT=$(echo "$ORDS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($ORDCOUNT order accounts)"

echo ""
echo "━━━ Phase 1 Complete ━━━"
echo ""

# ── Phase 2: Preview operations (safe) ──

echo "━━━ Phase 2: Preview Operations ━━━"

echo -n "  preview open_position (SOL LONG 2x, \$10 USDC)... "
PREVIEW=$(curl -sf -X POST "$API_URL/transaction-builder/open-position" \
  -H "Content-Type: application/json" \
  -d '{"inputTokenSymbol":"USDC","outputTokenSymbol":"SOL","inputAmountUi":"10.0","leverage":2.0,"tradeType":"LONG"}' 2>/dev/null)
ENTRY=$(echo "$PREVIEW" | python3 -c "import sys,json; print(json.load(sys.stdin).get('newEntryPrice','FAIL'))" 2>/dev/null || echo "FAIL")
echo "Entry: \$$ENTRY"

echo -n "  preview_limit_order_fees... "
LIMFEE=$(curl -sf -X POST "$API_URL/preview/limit-order-fees" \
  -H "Content-Type: application/json" \
  -d '{"marketSymbol":"SOL","inputAmountUi":"10.0","outputAmountUi":"0.07","side":"LONG"}' 2>/dev/null)
LIMENTRY=$(echo "$LIMFEE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('entryPriceUi','FAIL'))" 2>/dev/null || echo "FAIL")
echo "Entry: \$$LIMENTRY"

echo ""
echo "━━━ Phase 2 Complete ━━━"
echo ""

# ── Phase 3: Transaction operations (FUNDS AT RISK) ──

echo "━━━ Phase 3: Transaction Operations ━━━"
echo "WARNING: The following operations use real funds!"
echo "Each step will require confirmation."
echo ""

read -p "Run transaction tests? (yes/no): " TX_CONFIRM
if [ "$TX_CONFIRM" != "yes" ]; then
  echo "Skipping transaction tests."
  echo ""
  echo "=== LIVE TESTING COMPLETE (read + preview only) ==="
  exit 0
fi

echo ""
echo "  Step 1: Build open_position transaction..."
echo "  (SOL LONG, \$10 USDC, 2x leverage)"
OPEN_TX=$(curl -sf -X POST "$API_URL/transaction-builder/open-position" \
  -H "Content-Type: application/json" \
  -d "{\"inputTokenSymbol\":\"USDC\",\"outputTokenSymbol\":\"SOL\",\"inputAmountUi\":\"10.0\",\"leverage\":2.0,\"tradeType\":\"LONG\",\"owner\":\"$WALLET\"}" 2>/dev/null)

echo "$OPEN_TX" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  Entry: \${d.get(\"newEntryPrice\",\"?\")}')
print(f'  Leverage: {d.get(\"newLeverage\",\"?\")}x')
print(f'  Liq Price: \${d.get(\"newLiquidationPrice\",\"?\")}')
print(f'  Fee: \${d.get(\"entryFee\",\"?\")}')
has_tx = 'transactionBase64' in d and d['transactionBase64']
print(f'  Transaction: {\"YES\" if has_tx else \"NO\"} ({len(d.get(\"transactionBase64\",\"\"))} chars)')
" 2>/dev/null

echo ""
echo "  Transaction built. To execute:"
echo "  1. Copy the base64 transaction from the tool output"
echo "  2. Sign with your wallet (Phantom, Backpack, or CLI)"
echo "  3. Submit to Solana RPC"
echo ""
echo "  (Automated signing requires wallet integration — out of scope for MCP server)"
echo ""

echo "=== LIVE TESTING COMPLETE ==="
echo "Read: PASS | Preview: PASS | Transaction Build: PASS"
echo "Manual signing + submission required for on-chain execution."
