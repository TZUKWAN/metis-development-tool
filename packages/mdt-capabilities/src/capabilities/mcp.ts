/**
 * `mcp` capability (tasklist P09.11): call a tool on a configured MCP
 * server. 1.0 implements the stdio transport — a minimal JSON-RPC client
 * over the child's stdin/stdout with a progressive line buffer. Every step
 * is timeout-bounded and the child is always killed at the end, so a failed
 * or wedged server can never hang the main process. The server is an
 * EXTERNAL integration: env comes only from the context allowlist, and the
 * capability requires an explicit process grant.
 */
import { spawn } from 'node:child_process'

import { requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const MAX_REQUEST_TIMEOUT_MS = 60_000

interface McpConfig {
  transport: 'stdio' | 'http'
  command: string
  args: string[]
  url?: string
  timeoutMs: number
}

function parseConfig(value: unknown, server: string): McpConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`mcp: server "${server}" has no capability config — pass input.config with at least { command }`)
  }
  const raw = value as Record<string, unknown>
  if (raw.env !== undefined) {
    throw new Error('mcp: config.env is not supported — the server env comes from the capability context allowlist')
  }
  const transportRaw = raw.transport === undefined || raw.transport === '' ? 'stdio' : String(raw.transport)
  if (transportRaw !== 'stdio' && transportRaw !== 'http') {
    throw new Error(`mcp: config.transport must be "stdio" or "http" — got "${transportRaw}"`)
  }
  if (transportRaw === 'http') {
    throw new Error('mcp: transport "http" is not supported in 1.0 — configure a stdio server')
  }
  const command = typeof raw.command === 'string' && raw.command.trim() !== '' ? raw.command.trim() : undefined
  if (!command) {
    throw new Error(`mcp: config.command is required for the stdio transport (server "${server}")`)
  }
  const args = Array.isArray(raw.args) ? raw.args.map(String) : []
  const timeoutRaw = Number(raw.timeoutMs)
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? Math.min(Math.trunc(timeoutRaw), MAX_REQUEST_TIMEOUT_MS)
      : DEFAULT_REQUEST_TIMEOUT_MS
  return { transport: 'stdio', command, args, url: typeof raw.url === 'string' ? raw.url : undefined, timeoutMs }
}

export const mcpCapability: Capability = {
  manifest: {
    id: 'mcp',
    name: 'MCP Tool Call',
    version: '1.0.0',
    category: 'integration',
    description:
      'Call a tool on a configured MCP server (stdio JSON-RPC in 1.0). The server is an external integration spawned as a child process.',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'configured MCP server name' },
        tool: { type: 'string', description: 'tool name to call on the server' },
        args: { type: 'object', description: 'tool arguments object (default {})' },
        config: {
          type: 'object',
          description: 'server config: { command, args?, transport? (stdio default), url?, timeoutMs? }',
          properties: {
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            transport: { type: 'string', enum: ['stdio', 'http'] },
            url: { type: 'string' },
            timeoutMs: { type: 'number' },
          },
        },
      },
      required: ['server', 'tool', 'config'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { description: 'the tools/call result object from the MCP server (includes content)' },
      },
      required: ['result'],
      additionalProperties: false,
    },
    permissions: [
      { scope: 'process', detail: 'spawn and speak JSON-RPC to a configured MCP server (external integration)', required: true, defaultGranted: false },
    ],
    secrets: [],
    ui: {
      icon: '🔌',
      accent: '#5b8def',
      summary: 'Call a tool on an external MCP server integration (stdio)',
      keywords: ['mcp', 'integration', 'tool', 'jsonrpc'],
      doc: 'mcp',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(input: Record<string, unknown>, ctx: CapabilityContext): Promise<Record<string, unknown>> {
    requirePermission(ctx, mcpCapability, 'process')
    if (ctx.signal.aborted) throw new Error('mcp cancelled')

    const server = typeof input.server === 'string' && input.server.trim() !== '' ? input.server.trim() : null
    if (!server) throw new Error('mcp: "server" is required and must be a non-empty string')
    const tool = typeof input.tool === 'string' && input.tool.trim() !== '' ? input.tool.trim() : null
    if (!tool) throw new Error('mcp: "tool" is required and must be a non-empty string')
    if (input.args !== undefined && (typeof input.args !== 'object' || input.args === null || Array.isArray(input.args))) {
      throw new Error('mcp: "args" must be an object of tool arguments')
    }
    const toolArgs = (input.args ?? {}) as Record<string, unknown>
    const config = parseConfig(input.config, server)

    const env: Record<string, string> = {}
    for (const name of ctx.envAllowlist) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }

    ctx.log(`mcp server=${server} tool=${tool} transport=${config.transport} command=${config.command}`)
    const result = await callToolOverStdio({
      server,
      command: config.command,
      args: config.args,
      tool,
      toolArgs,
      timeoutMs: config.timeoutMs,
      env,
      signal: ctx.signal,
    })
    return { result }
  },
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** Minimal newline-delimited JSON-RPC client over a stdio MCP server. */
async function callToolOverStdio(opts: {
  server: string
  command: string
  args: string[]
  tool: string
  toolArgs: Record<string, unknown>
  timeoutMs: number
  env: Record<string, string>
  signal: AbortSignal
}): Promise<Record<string, unknown>> {
  const child = spawn(opts.command, opts.args, { shell: false, env: opts.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map<number, PendingRequest>()
  const state = { settled: false }
  let stderrTail = ''

  const fail = (err: Error): void => {
    if (state.settled) return
    state.settled = true
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    pending.clear()
    child.kill()
  }

  child.on('error', (err) => {
    fail(new Error(`mcp: failed to start MCP server "${opts.server}" (command "${opts.command}"): ${err.message}`))
  })
  child.on('exit', (code) => {
    if (pending.size > 0) {
      const tail = stderrTail.trim()
      fail(
        new Error(
          `mcp: server "${opts.server}" exited with code ${code ?? 'signal'} before responding${tail ? ` — ${tail.slice(-200)}` : ''}`,
        ),
      )
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000)
  })
  child.stdin?.on('error', () => {}) // EPIPE when the server dies mid-write is surfaced via pending rejects

  // progressive line buffer over stdout
  let buffer = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    for (;;) {
      const idx = buffer.indexOf('\n')
      if (idx < 0) break
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line === '') continue
      let message: { id?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown } }
      try {
        message = JSON.parse(line)
      } catch {
        continue // tolerate non-JSON noise on stdout
      }
      if (typeof message?.id !== 'number') continue // notification or malformed — nothing pending
      const entry = pending.get(message.id)
      if (!entry) continue
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) {
        entry.reject(
          new Error(`mcp: server "${opts.server}" returned error ${String(message.error.code ?? '')}: ${String(message.error.message ?? 'unknown error')}`),
        )
      } else {
        entry.resolve((message.result ?? {}) as Record<string, unknown>)
      }
    }
  })

  const onAbort = () => fail(new Error('mcp cancelled'))
  if (opts.signal.aborted) {
    fail(new Error('mcp cancelled'))
  } else {
    opts.signal.addEventListener('abort', onAbort, { once: true })
  }

  let nextId = 1
  const request = (method: string, params: unknown, what: string): Promise<Record<string, unknown>> => {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        child.kill()
        reject(new Error(`mcp: ${what} timed out after ${opts.timeoutMs}ms — the server will be terminated`))
      }, opts.timeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin?.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
        (err) => {
          if (err && pending.has(id)) {
            clearTimeout(timer)
            pending.delete(id)
            reject(new Error(`mcp: failed to write "${method}" to server "${opts.server}": ${err.message}`))
          }
        },
      )
    })
  }

  try {
    await request(
      'initialize',
      { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mdt-capabilities', version: '1.0.0' } },
      `initialize for server "${opts.server}"`,
    )
    child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    const callResult = await request('tools/call', { name: opts.tool, arguments: opts.toolArgs }, `tools/call "${opts.tool}"`)
    return callResult
  } finally {
    state.settled = true
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error(`mcp: connection to server "${opts.server}" was closed`))
    }
    pending.clear()
    opts.signal.removeEventListener('abort', onAbort)
    child.kill()
  }
}
