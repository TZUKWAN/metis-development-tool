import { describe, expect, it } from 'vitest'

import type { RegisteredTool, RuntimeEvent } from '../src/types'
import { createRuntimeAgent, modelFromPolicy } from '../src/adapter'
import { normalizeError } from '../src/errors'
import { MOCK_MODEL, mockStreamFn } from './mocks'

const config = {
  id: 'agent-1',
  name: 'Research Agent',
  instructions: 'You are a research assistant.',
  modelPolicy: {
    provider: 'mock',
    model: 'mock-model',
    api: 'openai-completions',
  } as const,
  memory: { enabled: false },
}

function textTool(): RegisteredTool {
  return {
    name: 'get_time',
    description: 'returns the current fake time',
    parameters: { type: 'object', properties: {}, required: [] },
    async execute() {
      return { content: { time: '12:00' } }
    },
  }
}

function collect(agent: ReturnType<typeof createRuntimeAgent>): RuntimeEvent[] {
  const events: RuntimeEvent[] = []
  agent.subscribe((e) => events.push(e))
  return events
}

describe('createRuntimeAgent (P08.02, P08.10)', () => {
  it('streams text deltas in order and finishes completed', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([{ text: 'Hello world, this is the answer.' }]),
    })
    const events = collect(agent)
    const result = await agent.run('What is the answer?')
    expect(result.stopReason).toBe('completed')
    expect(result.responseText).toBe('Hello world, this is the answer.')
    const kinds = events.map((e) => e.type)
    expect(kinds[0]).toBe('run_start')
    expect(kinds[1]).toBe('turn_start')
    expect(kinds.at(-1)).toBe('run_end')
    const deltas = events.filter((e): e is Extract<RuntimeEvent, { type: 'text_delta' }> => e.type === 'text_delta')
    expect(deltas.map((d) => d.delta).join('')).toBe('Hello world, this is the answer.')
  })

  it('executes tools and continues the loop: tool_start → tool_result → final text (P08.07)', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [textTool()],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([
        { toolCalls: [{ id: 'call-1', name: 'get_time', arguments: {} }] },
        { text: 'The time is 12:00.' },
      ]),
    })
    const events = collect(agent)
    const result = await agent.run('What time is it?')
    expect(result.stopReason).toBe('completed')
    expect(result.responseText).toBe('The time is 12:00.')
    const start = events.find((e): e is Extract<RuntimeEvent, { type: 'tool_start' }> => e.type === 'tool_start')
    const done = events.find((e): e is Extract<RuntimeEvent, { type: 'tool_result' }> => e.type === 'tool_result')
    expect(start?.name).toBe('get_time')
    expect(done?.isError).toBe(false)
    // tool result must precede the final text deltas
    const resultIdx = events.indexOf(done!)
    const firstFinalDelta = events.findIndex((e) => e.type === 'text_delta')
    expect(resultIdx).toBeGreaterThan(-1)
    expect(firstFinalDelta).toBeGreaterThan(resultIdx)
  })

  it('reports failing tools as errors to the model, not crashes (P08.13)', async () => {
    const failing: RegisteredTool = {
      name: 'explode',
      description: 'always fails',
      parameters: { type: 'object', properties: {}, required: [] },
      async execute() {
        throw new Error('sandbox violation')
      },
    }
    const agent = createRuntimeAgent({
      config,
      tools: [failing],
      getApiKey: () => 'unused',
      streamFn: mockStreamFn([
        { toolCalls: [{ id: 'call-err', name: 'explode', arguments: {} }] },
        { text: 'The tool failed; I told the user.' },
      ]),
    })
    const events = collect(agent)
    const result = await agent.run('do the thing')
    expect(result.stopReason).toBe('completed')
    const done = events.find((e): e is Extract<RuntimeEvent, { type: 'tool_result' }> => e.type === 'tool_result')
    expect(done?.isError).toBe(true)
  })

  it('cancels a run via abort() and reports cancelled (P08.12)', async () => {
    const agent = createRuntimeAgent({
      config,
      tools: [],
      getApiKey: () => 'unused',
      // a stream that hangs forever but honors the loop's abort signal —
      // user cancel must break the run and surface as 'cancelled'
      streamFn: ((_model: unknown, _context: unknown, options: { signal?: AbortSignal } | undefined) => {
        const signal = options?.signal
        return new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error('stream hung past test window')), 2_000)
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(new DOMException('aborted', 'AbortError'))
            },
            { once: true },
          )
        })
      }) as never,
    })
    const events = collect(agent)
    const runPromise = agent.run('long running')
    setTimeout(() => agent.abort(), 20)
    const result = await runPromise
    expect(result.stopReason).toBe('cancelled')
    const end = events.at(-1)
    expect(end?.type).toBe('run_end')
    if (end?.type === 'run_end') expect(end.stopReason).toBe('cancelled')
  })
})

describe('model policy mapping (P08.05)', () => {
  it('maps provider/model/compat onto a pi Model', () => {
    const model = modelFromPolicy({
      provider: 'my-endpoint',
      model: 'qwen-x',
      baseUrl: 'http://localhost:3001/v1',
      api: 'openai-completions',
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    })
    expect(model.provider).toBe('my-endpoint')
    expect(model.baseUrl).toBe('http://localhost:3001/v1')
    expect(MOCK_MODEL.api).toBe('openai-completions')
  })
})

describe('error normalization (P08.13)', () => {
  it('classifies timeout, provider, cancellation and unknown errors', () => {
    expect(normalizeError(new Error('request timeout after 30000ms')).kind).toBe('timeout')
    expect(normalizeError(new Error('API key missing for provider')).kind).toBe('provider')
    expect(normalizeError(new Error('operation aborted')).kind).toBe('cancelled')
    expect(normalizeError(new Error('TOOL_ERROR: sandbox violation')).kind).toBe('tool')
    expect(normalizeError(new Error('schema validation failed')).kind).toBe('validation')
    expect(normalizeError(42).message).toBe('42')
    expect(normalizeError(undefined).message).toBe('unknown runtime error')
  })
})
