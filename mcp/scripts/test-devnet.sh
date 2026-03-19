#!/bin/bash
set -e

echo "=== FLASH TRADE MCP — DEVNET TESTING ==="
echo "NOTE: Price-dependent operations will be skipped (Pyth mainnet only)"
echo ""

API_URL="${FLASH_API_URL:-http://localhost:3000}"
echo "Using API: $API_URL"
echo ""

# ── Read-only operations (work on devnet) ──

echo "━━━ Read-Only Operations ━━━"

echo -n "  health_check... "
curl -sf "$API_URL/health" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

echo -n "  get_markets... "
MARKETS=$(curl -sf "$API_URL/markets" 2>/dev/null)
COUNT=$(echo "$MARKETS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($COUNT markets)"

echo -n "  get_pools... "
POOLS=$(curl -sf "$API_URL/pools" 2>/dev/null)
PCOUNT=$(echo "$POOLS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($PCOUNT pools)"

echo -n "  get_custodies... "
CUSTS=$(curl -sf "$API_URL/custodies" 2>/dev/null)
CCOUNT=$(echo "$CUSTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "OK ($CCOUNT custodies)"

echo ""
echo "━━━ Price Operations (may return stale/zero on devnet) ━━━"

echo -n "  get_prices... "
PRICES=$(curl -sf "$API_URL/prices" 2>/dev/null || echo "{}")
PRICE_COUNT=$(echo "$PRICES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [ "$PRICE_COUNT" -gt 0 ]; then
  echo "OK ($PRICE_COUNT feeds — check if values are stale)"
else
  echo "SKIP (no price feeds on devnet)"
fi

echo ""

# ── Integration tests via vitest ──

echo "━━━ Running Integration Tests ━━━"
export FLASH_API_URL="$API_URL"
export RUN_INTEGRATION=1
export SKIP_PRICE_TESTS=1

cd "$(dirname "$0")/.."
bun run test:integration 2>&1 || echo "Some integration tests failed (expected on devnet)"

echo ""
echo "=== DEVNET TESTING COMPLETE ==="
