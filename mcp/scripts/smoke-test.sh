#!/bin/bash
# Quick MCP protocol smoke test — verifies server boots and lists tools
set -e

echo "=== MCP Smoke Test ==="

cd "$(dirname "$0")/.."

export FLASH_API_URL="${FLASH_API_URL:-http://localhost:3000}"

# Send initialize + tools/list, capture output
OUTPUT=$(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}\n{"jsonrpc":"2.0","id":4,"method":"resources/templates/list","params":{}}\n' | bun src/index.ts 2>/dev/null & PID=$!; sleep 2; kill $PID 2>/dev/null; wait $PID 2>/dev/null)

# Parse tool count
TOOL_COUNT=$(echo "$OUTPUT" | tr '\n' ' ' | python3 -c "
import sys, json
text = sys.stdin.read()
for line in text.strip().split('{\"result\"'):
    if '\"tools\":[' in line:
        data = json.loads('{\"result\"' + line.split('{\"result\"')[0] if '{\"result\"' in line else '{\"result\"' + line)
        tools = data.get('result', {}).get('tools', [])
        print(len(tools))
        break
" 2>/dev/null || echo "0")

# Parse resource count
RESOURCE_COUNT=$(echo "$OUTPUT" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        if 'resources' in d.get('result', {}):
            print(len(d['result']['resources']))
            break
    except: pass
else:
    print('0')
" 2>/dev/null || echo "0")

TEMPLATE_COUNT=$(echo "$OUTPUT" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        if 'resourceTemplates' in d.get('result', {}):
            print(len(d['result']['resourceTemplates']))
            break
    except: pass
else:
    print('0')
" 2>/dev/null || echo "0")

echo "  Tools: $TOOL_COUNT (expected: 23)"
echo "  Resources: $RESOURCE_COUNT (expected: 1)"
echo "  Resource Templates: $TEMPLATE_COUNT (expected: 2)"

if [ "$TOOL_COUNT" -eq 23 ] && [ "$RESOURCE_COUNT" -eq 1 ] && [ "$TEMPLATE_COUNT" -eq 2 ]; then
  echo ""
  echo "PASS: All 23 tools + 3 resources registered"
  exit 0
else
  echo ""
  echo "FAIL: Expected 23 tools, 1 resource, 2 templates"
  exit 1
fi
