import { describe, expect, it } from 'vitest'

import { CapabilityManifestSchema, type Capability } from '@mdt/capabilities'

import { createRuntimeAgent, toolFromRegistered } from '../src/adapter'
import { buildRegisteredTool } from '../src/capability-bridge'
import { normalizeError } from '../src/errors'
import type { RegisteredTool, RuntimeEvent, RuntimeEventListener } from '../src/types'
import { mockStreamFn } from './mocks'

const config = {
  id: 'agent-2',
  name: 'State Agent',
  instructions: 'You repeat things.',
  modelPolicy: {
    provider: 'mock',
    model: 'mock-model',
    api: 'openai-completions',
  } as const,
  memory: { enabled: false },
}

function collect(agent: ReturnType<typeof createRuntimeAgent>): RuntimeEvent[] {
  const events: RuntimeEvent[] = []
  agent.subscribe((e) => events.push(e))
  return events
}

describe('RuntimeAgent subscription + run state', () => {
  it('subscribe() returns an unsubscribe that reports whether a listener was removed', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([{ text: 'ignored' }]),
    })
    const seen: string[] = []
    const listener: RuntimeEventListener = (e) => {
      if (e.type === 'run_end') seen.push(e.responseText)
    }
    const unsubscribe = agent.subscribe(listener)
    expect(typeof unsubscribe).toBe('function')
    expect(unsubscribe()).toBe(true) // removed
    expect(unsubscribe()).toBe(false) // already gone
    await agent.run('any input')
    expect(seen).toEqual([]) // listener never fired after unsubscribe
  })

  it('a second run resets per-run state: deltas and responseText are per run', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([{ text: 'first run response' }, { text: 'second run response' }]),
    })
    const events = collect(agent)
    const first = await agent.run('one')
    const second = await agent.run('two')
    expect(first.responseText).toBe('first run response')
    expect(second.responseText).toBe('second run response')
    const runs = events.filter((e) => e.type === 'run_start')
    expect(runs).toHaveLength(2)
    const deltas = events.filter(
      (e): e is Extract<RuntimeEvent, { type: 'text_delta' }> => e.type === 'text_delta',
    )
    // both runs' deltas appear in order — run 2 does not leak run 1's text
    expect(deltas.map((d) => d.delta).join('')).toBe('first run responsesecond run response')
    const ends = events.filter((e) => e.type === 'run_end')
    expect(ends).toHaveLength(2)
    if (ends[0]?.type === 'run_end' && ends[1]?.type === 'run_end') {
      expect(ends[0].responseText).toBe('first run response')
      expect(ends[1].responseText).toBe('second run response')
    }
  })

  it('thinking deltas surface as thinking_delta events', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([{ thinking: 'pondering the answer', text: 'answer' }]),
    })
    const events = collect(agent)
    const result = await agent.run('think about it')
    expect(result.responseText).toBe('answer')
    const thinking = events.filter((e) => e.type === 'thinking_delta')
    expect(thinking.map((e) => (e as { delta: string }).delta).join('')).toBe(
      'pondering the answer',
    )
  })

  it('a failing run surfaces a normalized run_end error through the catch path (P08.13)', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [],
      getApiKey: () => 'unused',
      // pi-agent-core swallows stream failures internally, so force the
      // adapter's catch: a listener that throws on turn_end escapes the
      // loop's failure handler and rejects agent.prompt()
      streamFn: (() => {
        throw new Error('API key missing for provider mock')
      }) as never,
    })
    const events: RuntimeEvent[] = []
    agent.subscribe((e) => events.push(e))
    agent.subscribe((e) => {
      if (e.type === 'turn_end') throw new Error('synthetic listener failure')
    })
    const result = await agent.run('anything')
    expect(result.stopReason).toBe('error')
    const end = events.at(-1)
    expect(end?.type).toBe('run_end')
    if (end?.type === 'run_end') {
      expect(end.error?.kind).toBe('unknown')
      expect(end.error?.message).toContain('synthetic listener failure')
    }
  })
})

describe('RegisteredTool bridged through the agent loop (P08.07 + P11.10)', () => {
  const manifest = CapabilityManifestSchema.parse({
    id: 'workspace_scan',
    name: 'Workspace Scan',
    version: '1.0.0',
    category: 'filesystem',
    description: 'Scans the workspace for bridge testing',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {} },
    ui: { summary: 'scan' },
  })

  it('capability log output becomes tool_progress events; results feed the model', async () => {
    const hostLog: string[] = []
    const capability: Capability = {
      manifest,
      async execute(_args, ctx) {
        ctx.log('scanning workspace files')
        return { files: 3 }
      },
    }
    const tool = buildRegisteredTool({
      capability,
      secrets: {},
      granted: new Set(['filesystem'] as never),
      sandboxRoots: ['/workspace/project'],
      workdir: '/workspace/project',
      envAllowlist: ['PATH'],
      askUser: async () => ({ answered: false }),
      log: (m) => hostLog.push(m),
    })
    const agent = createRuntimeAgent({
      config,
      tools: [tool],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([
        { toolCalls: [{ id: 'call-scan', name: 'workspace_scan', arguments: {} }] },
        { text: 'Scan found 3 files.' },
      ]),
    })
    const events = collect(agent)
    const result = await agent.run('scan the workspace')
    expect(result.stopReason).toBe('completed')
    expect(hostLog).toEqual(['[workspace_scan] scanning workspace files'])
    const progress = events.filter((e) => e.type === 'tool_progress').map((e) => e.message)
    // 'running' (execution start) + the capability's own ctx.log output
    expect(progress).toEqual(['running', 'scanning workspace files'])
    const done = events.find((e) => e.type === 'tool_result')
    expect(done).toMatchObject({ type: 'tool_result', name: 'workspace_scan', isError: false })
  })
})

describe('toolFromRegistered error surface (P08.13)', () => {
  it('an isError result throws with the content error text', async () => {
    const failing: RegisteredTool = {
      name: 'bad_tool',
      description: 'returns a structured error',
      parameters: { type: 'object', properties: {}, required: [] },
      async execute() {
        return { content: { error: 'permission denied by sandbox' }, isError: true }
      },
    }
    const wrapped = toolFromRegistered(failing)
    await expect(
      wrapped.execute('call-1', {}, new AbortController().signal, () => {}),
    ).rejects.toThrow('permission denied by sandbox')
  })
})

describe('normalizeError remaining branches (P08.13)', () => {
  it('classifies bare strings, empty messages and unclassifiable errors', () => {
    expect(normalizeError('request timeout after 30000ms').kind).toBe('timeout')
    const empty = new Error('')
    expect(normalizeError(empty).message).toBe('Error') // falls back to err.name
    expect(normalizeError(new Error('totally unclassifiable situation')).kind).toBe('unknown')
  })
})
