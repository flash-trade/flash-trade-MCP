import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'

function sendJsonRpc(proc: ReturnType<typeof spawn>, method: string, params: Record<string, unknown> = {}, id?: number): void {
  const msg = JSON.stringify({ jsonrpc: '2.0', ...(id != null ? { id } : {}), method, params })
  proc.stdin!.write(msg + '\n')
}

function collectOutput(proc: ReturnType<typeof spawn>, timeoutMs = 3000): Promise<string[]> {
  return new Promise((resolve) => {
    let buffer = ''
    proc.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
    })
    setTimeout(() => {
      proc.kill()
      // Parse complete JSON objects from the buffer
      const messages: string[] = []
      let depth = 0
      let start = -1
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === '{') {
          if (depth === 0) start = i
          depth++
        } else if (buffer[i] === '}') {
          depth--
          if (depth === 0 && start >= 0) {
            messages.push(buffer.slice(start, i + 1))
            start = -1
          }
        }
      }
      resolve(messages)
    }, timeoutMs)
  })
}

describe.skipIf(!process.env.RUN_INTEGRATION)('MCP protocol', () => {
  it('responds to initialize with correct server info', async () => {
    const proc = spawn('bun', ['run', 'src/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, FLASH_API_URL: process.env.FLASH_API_URL ?? 'http://localhost:3000' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    sendJsonRpc(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.1' },
    }, 1)

    const messages = await collectOutput(proc, 2000)
    expect(messages.length).toBeGreaterThan(0)

    const response = JSON.parse(messages[0]!) as {
      result: { serverInfo: { name: string }; capabilities: { tools: object } }
    }
    expect(response.result.serverInfo.name).toBe('flash-trade')
    expect(response.result.capabilities.tools).toBeDefined()
  })

  it('lists all 29 tools', async () => {
    const proc = spawn('bun', ['run', 'src/index.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, FLASH_API_URL: process.env.FLASH_API_URL ?? 'http://localhost:3000' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    sendJsonRpc(proc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.1' },
    }, 1)
    sendJsonRpc(proc, 'notifications/initialized')
    sendJsonRpc(proc, 'tools/list', {}, 2)

    const messages = await collectOutput(proc, 3000)
    const toolsResponse = messages.find(m => m.includes('"tools":['))
    expect(toolsResponse).toBeDefined()

    const parsed = JSON.parse(toolsResponse!) as { result: { tools: { name: string }[] } }
    expect(parsed.result.tools).toHaveLength(29)

    const names = parsed.result.tools.map(t => t.name)
    expect(names).toContain('health_check')
    expect(names).toContain('open_position')
    expect(names).toContain('preview_tp_sl')
    expect(names).toContain('get_pool_data')
    expect(names).toContain('get_account_summary')
    expect(names).toContain('get_trading_overview')
    expect(names).toContain('place_trigger_order')
    expect(names).toContain('cancel_all_trigger_orders')
  })
})
