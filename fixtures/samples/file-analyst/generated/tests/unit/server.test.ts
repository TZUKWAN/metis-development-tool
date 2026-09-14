/**
 * @vitest-environment node
 *
 * Agent service tests with a MOCK agent factory (no Pi, no network): health,
 * SSE run streaming, cancel and capability invocation.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from '../../server/index.js'

/** Minimal scripted runtime agent standing in for createRuntimeAgent. */
function fakeRuntime(responseText: string) {
  const listeners = new Set<(event: Record<string, unknown>) => void>()
  return {
    subscribe(listener: (event: Record<string, unknown>) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async run(input: string) {
      for (const listener of listeners) listener({ type: 'run_start', runId: 'r1' })
      for (const listener of listeners) listener({ type: 'text_delta', delta: input })
      for (const listener of listeners)
        listener({ type: 'run_end', stopReason: 'completed', responseText })
      return { responseText, stopReason: 'completed' }
    },
    abort() {
      for (const listener of listeners)
        listener({ type: 'run_end', stopReason: 'cancelled', responseText: '' })
    },
  }
}

const deps = {
  agentsConfig: {
    agents: [
      {
        id: 'agent-1',
        name: 'Test Agent',
        instructions: 'test',
        modelPolicy: { provider: 'mock', model: 'mock-1', api: 'openai-completions' },
        memory: { enabled: false },
        capabilityInstanceIds: ['cap-1'],
      },
    ],
  },
  capabilityHost: {
    capabilityExecutors: {
      mock_cap: {
        manifest: { id: 'mock_cap', description: 'mock', inputSchema: { type: 'object' } },
        execute: async (input: Record<string, unknown>) => ({ echo: input }),
      },
    },
    capabilityInstances: [
      {
        instanceId: 'cap-1',
        capabilityId: 'mock_cap',
        config: {},
        secretEnv: {},
        grantedScopes: [],
      },
    ],
  },
  createRuntimeAgent: () => fakeRuntime('mocked response'),
  getApiKey: () => 'test-key',
  log: () => {},
}

async function startApp() {
  const { app } = createApp(deps as never)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  cleanup = null
})

describe('agent service', () => {
  it('reports health', async () => {
    const { server, baseUrl } = await startApp()
    cleanup = () => server.close()
    const response = await fetch(`${baseUrl}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('streams normalized RuntimeEvents as SSE and ends after run_end', async () => {
    const { server, baseUrl } = await startApp()
    cleanup = () => server.close()
    const response = await fetch(`${baseUrl}/api/agent/agent-1/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello', sessionId: 's1' }),
    })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    const events = body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice('data:'.length)))
    expect(events.map((event) => event.type)).toEqual(['run_start', 'text_delta', 'run_end'])
    expect(events[1].delta).toBe('hello')
    expect(events[2]).toMatchObject({ stopReason: 'completed', responseText: 'mocked response' })
  })

  it('rejects unknown agents with 404', async () => {
    const { server, baseUrl } = await startApp()
    cleanup = () => server.close()
    const response = await fetch(`${baseUrl}/api/agent/nope/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'x', sessionId: 's1' }),
    })
    expect(response.status).toBe(404)
  })

  it('invokes capability instances in-process', async () => {
    const { server, baseUrl } = await startApp()
    cleanup = () => server.close()
    const response = await fetch(`${baseUrl}/api/capability/cap-1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args: { q: 'hi' } }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, content: { echo: { q: 'hi' } } })
  })

  it('cancels the active run for a session', async () => {
    const { server, baseUrl } = await startApp()
    cleanup = () => server.close()
    // create the session first
    await fetch(`${baseUrl}/api/agent/agent-1/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'warm up', sessionId: 's2' }),
    }).then((response) => response.text())
    const response = await fetch(`${baseUrl}/api/agent/agent-1/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's2' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    // unknown session → 404
    const missing = await fetch(`${baseUrl}/api/agent/agent-1/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's-none' }),
    })
    expect(missing.status).toBe(404)
  })
})
