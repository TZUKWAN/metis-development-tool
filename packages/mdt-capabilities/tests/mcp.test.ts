/**
 * mcp capability tests: a fake MCP server spawned as `node -e <script>`
 * speaking newline-delimited JSON-RPC over stdio, plus prompt-failure cases
 * (bad command, unsupported transport, missing config).
 */
import { describe, expect, it } from 'vitest'

import { createCapabilityContext, type ContextOverrides } from '../src/context'
import { mcpCapability } from '../src/capabilities/mcp'
import { runCapabilityContractTests } from '../src/testing'

/** Tiny JSON-RPC-over-stdio MCP stub (initialize + tools/call). */
const FAKE_SERVER_SCRIPT = [
  "let buf = '';",
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data', (chunk) => {",
  '  buf += chunk;',
  '  let idx;',
  "  while ((idx = buf.indexOf('\\n')) >= 0) {",
  '    const line = buf.slice(0, idx);',
  '    buf = buf.slice(idx + 1);',
  '    if (!line.trim()) continue;',
  '    const msg = JSON.parse(line);',
  "    if (msg.method === 'initialize') {",
  '      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {',
  '        protocolVersion: "2024-11-05",',
  '        serverInfo: { name: "fake-mcp", version: "1.0.0" },',
  '        capabilities: { tools: {} },',
  '      } }) + "\\n");',
  "    } else if (msg.method === 'tools/call') {",
  "      if (msg.params.name === 'fail') {",
  '        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "nope" } }) + "\\n");',
  '      } else {',
  '        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {',
  '          content: [{ type: "text", text: "echo:" + JSON.stringify(msg.params.arguments) }],',
  '        } }) + "\\n");',
  '      }',
  '    }',
  '  }',
  '});',
].join('\n')

const overrides: ContextOverrides = { granted: ['process'] }

function serverConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    command: process.execPath,
    args: ['-e', FAKE_SERVER_SCRIPT],
    transport: 'stdio',
    ...extra,
  }
}

runCapabilityContractTests(mcpCapability, overrides, {
  happyInput: { server: 'fake', tool: 'echo', args: { x: 1 }, config: serverConfig() },
  invalidInput: { server: 'fake', tool: 'echo' }, // missing config
})

describe('mcp stdio transport', () => {
  const ctx = createCapabilityContext(overrides)

  it('denies the default context (process is never default-granted)', async () => {
    const ctxNoGrant = createCapabilityContext({})
    await expect(
      mcpCapability.execute({ server: 'fake', tool: 'echo', config: serverConfig() }, ctxNoGrant),
    ).rejects.toThrow(/requires process permission/)
  })

  it('performs initialize + tools/call and returns the result content', async () => {
    const out = await mcpCapability.execute(
      { server: 'fake', tool: 'echo', args: { hello: 'world', n: 2 }, config: serverConfig() },
      ctx,
    )
    const result = out.result as { content: { type: string; text: string }[] }
    expect(result.content[0].text).toBe('echo:{"hello":"world","n":2}')
  }, 20_000)

  it('surfaces JSON-RPC errors from the server as structured errors', async () => {
    await expect(
      mcpCapability.execute({ server: 'fake', tool: 'fail', config: serverConfig() }, ctx),
    ).rejects.toThrow(/error -32000: nope/)
  }, 20_000)

  it('fails fast when the server command cannot spawn (no hang)', async () => {
    const started = Date.now()
    await expect(
      mcpCapability.execute(
        { server: 'ghost', tool: 'echo', config: { command: 'definitely-not-a-real-cmd-xyz' } },
        ctx,
      ),
    ).rejects.toThrow(
      /failed to start MCP server "ghost" \(command "definitely-not-a-real-cmd-xyz"\)/,
    )
    expect(Date.now() - started).toBeLessThan(10_000)
  }, 15_000)

  it('rejects the http transport in 1.0', async () => {
    await expect(
      mcpCapability.execute(
        { server: 'web', tool: 'echo', config: { transport: 'http', url: 'http://x.test/sse' } },
        ctx,
      ),
    ).rejects.toThrow(/transport "http" is not supported in 1\.0/)
  })

  it('rejects config.env (env comes from the context allowlist)', async () => {
    await expect(
      mcpCapability.execute(
        { server: 'fake', tool: 'echo', config: serverConfig({ env: { A: 'b' } }) },
        ctx,
      ),
    ).rejects.toThrow(/config\.env is not supported/)
  })

  it('requires config.command for the stdio transport', async () => {
    await expect(
      mcpCapability.execute({ server: 'fake', tool: 'echo', config: { transport: 'stdio' } }, ctx),
    ).rejects.toThrow(/config\.command is required for the stdio transport \(server "fake"\)/)
  })
})
