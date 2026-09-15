/**
 * Tool approval bridge tests (tasklist P08.11): the beforeToolCall wiring
 * must gate a real tool behind the bridge — allow/deny/ask policies map
 * onto `{ block, reason }`, and a pending decision must not survive an
 * abort.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  createApprovalHook,
  DENY_ALL_REASON,
  NO_ASK_UI_REASON,
  policyBridge,
  raceAbort,
  type ApprovalBridge,
  type ApprovalDecision,
  type ApprovalRequest,
} from '../src/approval'
import type { RegisteredTool, RuntimeEvent } from '../src/types'
import { createRuntimeAgent } from '../src/adapter'
import { mockStreamFn } from './mocks'

const config = {
  id: 'agent-1',
  name: 'Gated Agent',
  instructions: 'You may call tools.',
  modelPolicy: {
    provider: 'mock',
    model: 'mock-model',
    api: 'openai-completions',
  } as const,
  memory: { enabled: false },
}

/** A real (would-be side-effecting) tool whose execution the tests observe. */
function gatedTool(onExecute?: () => void): RegisteredTool {
  return {
    name: 'web_fetch',
    description: 'fetches a URL',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async execute(args) {
      onExecute?.()
      return { content: { fetched: args['url'] } }
    },
  }
}

function collect(agent: ReturnType<typeof createRuntimeAgent>): RuntimeEvent[] {
  const events: RuntimeEvent[] = []
  agent.subscribe((e) => events.push(e))
  return events
}

function toolResultEvent(events: RuntimeEvent[]): Extract<RuntimeEvent, { type: 'tool_result' }> {
  const done = events.find(
    (e): e is Extract<RuntimeEvent, { type: 'tool_result' }> => e.type === 'tool_result',
  )
  if (!done) throw new Error('expected a tool_result event')
  return done
}

const TWO_TURN_SCRIPT = [
  { toolCalls: [{ id: 'call-1', name: 'web_fetch', arguments: { url: 'https://example.com' } }] },
  { text: 'Done.' },
]

describe('approval policies (P08.11)', () => {
  it('allow-all executes the tool (a)', async () => {
    const executed = vi.fn()
    const agent = createRuntimeAgent({
      config,
      tools: [gatedTool(executed)],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn(TWO_TURN_SCRIPT),
      approval: { bridge: policyBridge('allow-all'), scopesByTool: new Map() },
    })
    const events = collect(agent)
    const result = await agent.run('fetch example.com')
    expect(result.stopReason).toBe('completed')
    expect(executed).toHaveBeenCalledTimes(1)
    expect(toolResultEvent(events).isError).toBe(false)
  })

  it('deny-all blocks and the reason surfaces as an error tool result (b)', async () => {
    const executed = vi.fn()
    const agent = createRuntimeAgent({
      config,
      tools: [gatedTool(executed)],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn(TWO_TURN_SCRIPT),
      approval: { bridge: policyBridge('deny-all'), scopesByTool: new Map() },
    })
    const events = collect(agent)
    const result = await agent.run('fetch example.com')
    // the run itself completes: the model sees the error result and narrates
    expect(result.stopReason).toBe('completed')
    expect(result.responseText).toBe('Done.')
    expect(executed).not.toHaveBeenCalled()
    const done = toolResultEvent(events)
    expect(done.isError).toBe(true)
    expect(done.name).toBe('web_fetch')
    expect(JSON.stringify(done.content)).toContain(DENY_ALL_REASON)
  })

  it("'ask' with an approving bridge executes and passes toolName/args/scopes (c)", async () => {
    const executed = vi.fn()
    const seen: ApprovalRequest[] = []
    const ask = async (req: ApprovalRequest): Promise<ApprovalDecision> => {
      seen.push(req)
      return { approved: true }
    }
    const agent = createRuntimeAgent({
      config,
      tools: [gatedTool(executed)],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn(TWO_TURN_SCRIPT),
      approval: {
        bridge: policyBridge('ask', ask),
        scopesByTool: new Map([['web_fetch', ['network']]]),
      },
    })
    const events = collect(agent)
    const result = await agent.run('fetch example.com')
    expect(result.stopReason).toBe('completed')
    expect(executed).toHaveBeenCalledTimes(1)
    expect(toolResultEvent(events).isError).toBe(false)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({
      toolName: 'web_fetch',
      args: { url: 'https://example.com' },
      scopes: ['network'],
    })
  })

  it("'ask' with a rejecting bridge blocks with the bridge's reason (d)", async () => {
    const executed = vi.fn()
    const ask = async (): Promise<ApprovalDecision> => ({
      approved: false,
      reason: 'user clicked Deny',
    })
    const agent = createRuntimeAgent({
      config,
      tools: [gatedTool(executed)],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn(TWO_TURN_SCRIPT),
      approval: { bridge: policyBridge('ask', ask), scopesByTool: new Map() },
    })
    const events = collect(agent)
    const result = await agent.run('fetch example.com')
    expect(result.stopReason).toBe('completed')
    expect(executed).not.toHaveBeenCalled()
    expect(toolResultEvent(events).isError).toBe(true)
    expect(JSON.stringify(toolResultEvent(events).content)).toContain('user clicked Deny')
  })

  it('abort while awaiting the bridge rejects cleanly: cancelled run, no execution (e)', async () => {
    const executed = vi.fn()
    let settle: ((d: ApprovalDecision) => void) | undefined
    const hang: ApprovalBridge = {
      requestApproval: () =>
        new Promise<ApprovalDecision>((resolve) => {
          settle = resolve
        }),
    }
    const agent = createRuntimeAgent({
      config,
      tools: [gatedTool(executed)],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn(TWO_TURN_SCRIPT),
      approval: { bridge: hang, scopesByTool: new Map() },
    })
    const events = collect(agent)
    const runPromise = agent.run('fetch example.com')
    await vi.waitFor(() => expect(settle).toBeDefined(), { timeout: 1_000 })
    setTimeout(() => agent.abort(), 10)
    const result = await runPromise
    expect(result.stopReason).toBe('cancelled')
    expect(executed).not.toHaveBeenCalled()
    // the aborted approval turned into an error tool result, never a hang
    const done = toolResultEvent(events)
    expect(done.isError).toBe(true)
    expect(JSON.stringify(done.content).toLowerCase()).toContain('abort')
    // resolving the abandoned bridge later must not throw (dropped, not unhandled)
    settle?.({ approved: true })
  })
})

describe('approval hook units', () => {
  it('falls back to the default deny reason when the bridge gives none', async () => {
    const hook = createApprovalHook({
      bridge: { requestApproval: async () => ({ approved: false }) },
      scopesByTool: new Map(),
      defaultDenyReason: 'not today',
    })
    const decision = await hook({ toolCall: { name: 't', arguments: {} } } as never)
    expect(decision).toEqual({ block: true, reason: 'not today' })
  })

  it('uses the generic fallback reason and empty scopes for unlisted tools', async () => {
    const seen: ApprovalRequest[] = []
    const hook = createApprovalHook({
      bridge: {
        requestApproval: async (req) => {
          seen.push(req)
          return { approved: false }
        },
      },
      scopesByTool: new Map([['other', ['filesystem']]]),
    })
    const decision = await hook({
      toolCall: { name: 'unlisted', arguments: { x: 1 } },
      args: { x: 1 },
    } as never)
    expect(decision).toMatchObject({ block: true, reason: 'tool "unlisted" was not approved' })
    expect(seen[0]).toEqual({ toolName: 'unlisted', args: { x: 1 }, scopes: [] })
  })

  it("'ask' without a decision callback fails closed", async () => {
    const bridge = policyBridge('ask')
    await expect(bridge.requestApproval({ toolName: 't', args: {}, scopes: [] })).resolves.toEqual({
      approved: false,
      reason: NO_ASK_UI_REASON,
    })
  })

  it('raceAbort rejects immediately for an already-aborted signal, passes through without one', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(raceAbort(Promise.resolve(1), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(raceAbort(Promise.resolve(2))).resolves.toBe(2)
  })

  it('raceAbort prefers the signal reason even when it is not an Error', async () => {
    const controller = new AbortController()
    const pending = new Promise<number>(() => {})
    setTimeout(() => controller.abort('because'), 5)
    await expect(raceAbort(pending, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('raceAbort propagates bridge rejections and stops listening after settle', async () => {
    const controller = new AbortController()
    await expect(
      raceAbort(Promise.reject(new Error('bridge down')), controller.signal),
    ).rejects.toThrow('bridge down')
    // aborting after settlement must not produce an unhandled rejection
    expect(() => controller.abort()).not.toThrow()
  })
})
