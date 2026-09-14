/**
 * Mock provider for adapter tests (tasklist P14.07): a scripted StreamFn —
 * no network, no API keys, deterministic event ordering.
 */
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { createAssistantMessageEventStream, type Api, type AssistantMessageEventStream, type Context, type Model } from '@earendil-works/pi-ai'

export const MOCK_MODEL: Model<'openai-completions'> = {
  id: 'mock-model',
  name: 'Mock Model',
  api: 'openai-completions',
  provider: 'mock',
  baseUrl: 'http://localhost:9/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_000,
  maxTokens: 1_000,
} as Model<'openai-completions'>

interface MockUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

function usage(): MockUsage {
  return { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
}

interface MockAssistantMessage {
  role: 'assistant'
  content: MockAssistantContent[]
  api: string
  provider: string
  model: string
  usage: MockUsage
  stopReason: string
  timestamp: number
}

function assistantMessage(content: MockAssistantContent[], stopReason: 'stop' | 'toolUse'): MockAssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'mock',
    model: 'mock-model',
    usage: usage(),
    stopReason,
    timestamp: Date.now(),
  }
}

type MockAssistantContent =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }

export interface MockTurn {
  text?: string
  toolCalls?: { id: string; name: string; arguments: Record<string, unknown> }[]
}

/**
 * Build a StreamFn that plays `turns` in order: each invocation emits
 * text deltas and/or tool calls, then `done`. Tool results feed the next
 * turn, exactly like a real provider conversation.
 */
export function mockStreamFn(turns: MockTurn[]): StreamFn {
  let call = 0
  return (_model: Model<Api>, _context: Context): AssistantMessageEventStream => {
    const turn = turns[Math.min(call, turns.length - 1)]
    call++
    const stream = createAssistantMessageEventStream()
    const content: MockAssistantContent[] = []
    const message = () => assistantMessage(content, turn.toolCalls?.length ? 'toolUse' : 'stop')
    // Populate the stream synchronously BEFORE returning it: the loop
    // consumes concurrently with queued microtask pushes and can miss events.
    ;(() => {
      stream.push({ type: 'start', partial: message() as never })
      if (turn.text) {
        stream.push({ type: 'text_start', contentIndex: 0, partial: message() as never })
        const parts = turn.text.match(/.{1,12}/gs) ?? []
        parts.forEach((part) => {
          content[0] = { type: 'text', text: (content[0]?.type === 'text' ? content[0].text : '') + part }
          stream.push({ type: 'text_delta', contentIndex: 0, delta: part, partial: message() as never })
        })
        stream.push({ type: 'text_end', contentIndex: 0, content: turn.text, partial: message() as never })
      }
      for (const tc of turn.toolCalls ?? []) {
        const call = { type: 'toolCall' as const, id: tc.id, name: tc.name, arguments: tc.arguments }
        content.push(call)
        stream.push({ type: 'toolcall_end', contentIndex: content.length - 1, toolCall: call, partial: message() as never })
      }
      const final = message()
      stream.push({ type: 'done', reason: turn.toolCalls?.length ? 'toolUse' : 'stop', message: final as never })
      stream.end(final as never)
    })()
    return stream
  }
}
