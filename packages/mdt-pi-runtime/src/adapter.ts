/**
 * Pi Agent Core adapter (tasklist P08.02, ADR-0004).
 *
 * MDT's single integration point with Pi: blueprint-configured agents in,
 * normalized RuntimeEvents out. MDT never reimplements the agent loop —
 * `Agent` from pi-agent-core owns it; we only translate configuration and
 * events at the boundary.
 */
import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core'
import { type Api, type Model, type SimpleStreamOptions } from '@earendil-works/pi-ai'
import { streamSimple } from '@earendil-works/pi-ai/compat'

import type { AgentConfig, RegisteredTool, RuntimeEvent, RuntimeEventListener } from './types'
import { normalizeError } from './errors'

export interface CreateAgentOptions {
  config: AgentConfig
  tools: RegisteredTool[]
  /** API key resolved per provider; generated apps wire this from their own env */
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined
  /** test seam: inject a scripted StreamFn (mock provider, no network) */
  streamFn?: StreamFn
}

/** Map an MDT model policy onto a pi-ai Model object (P08.05). */
export function modelFromPolicy(policy: AgentConfig['modelPolicy']): Model<Api> {
  const model: Model<'openai-completions'> = {
    id: policy.model,
    name: policy.model,
    // the endpoint speaks OpenAI chat-completions shape by default; other
    // apis are cast through — the runtime validates server-side anyway
    api: policy.api as 'openai-completions',
    provider: policy.provider,
    baseUrl: policy.baseUrl ?? '',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: policy.maxTokens ?? 8_192,
    compat: {
      supportsDeveloperRole: policy.compat?.supportsDeveloperRole ?? false,
      supportsReasoningEffort: policy.compat?.supportsReasoningEffort ?? false,
      supportsStrictMode: policy.compat?.supportsStrictMode ?? false,
    },
  }
  return model as Model<Api>
}

/** MDT RegisteredTool → Pi AgentTool (manifest JSON Schema passes through). */
export function toolFromRegistered(tool: RegisteredTool): AgentTool {
  const parameters = tool.parameters as AgentTool['parameters']
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters,
    execute: async (toolCallId: string, rawParams: unknown, signal?: AbortSignal, onUpdate?: (u: { content: { type: 'text'; text: string }[]; details: Record<string, never> }) => void) => {
      onUpdate?.({ content: [{ type: 'text', text: 'running' }], details: {} })
      // Contract: a failing tool THROWS. Pi converts the throw into an
      // isError tool result the model can react to — catching here would
      // hide the failure from both the model and the UI.
      const result = await tool.execute(rawParams as Record<string, unknown>, signal ?? new AbortController().signal, (message) =>
        onUpdate?.({ content: [{ type: 'text', text: message }], details: {} }),
      )
      if (result.isError) {
        throw new Error(extractText(result.content))
      }
      return { content: [{ type: 'text', text: JSON.stringify(result.content) }], details: result.content }
    },
  }
}

function extractText(content: Record<string, unknown>): string {
  if (typeof content.error === 'string') return content.error
  return JSON.stringify(content).slice(0, 500)
}

export interface RuntimeAgent {
  /** subscribe to normalized events; returns an unsubscribe function */
  subscribe(listener: RuntimeEventListener): () => void
  /** run one full agent turn-set; resolves after run_end */
  run(input: string): Promise<{ responseText: string; stopReason: 'completed' | 'cancelled' | 'error' }>
  /** cancel the active run (P08.12) */
  abort(): void
  /** direct access for embedding hosts that need the Pi agent (approval bridge) */
  readonly raw: Agent
}

export function createRuntimeAgent(options: CreateAgentOptions): RuntimeAgent {
  const { config, tools, getApiKey, streamFn } = options
  const model = modelFromPolicy(config.modelPolicy)
  const listeners = new Set<RuntimeEventListener>()

  const agent = new Agent({
    initialState: {
      systemPrompt: config.instructions,
      model,
      tools: tools.map(toolFromRegistered),
      messages: [],
    },
    streamFn: streamFn ?? ((m, ctx, opts) => streamSimple(m, ctx, opts as SimpleStreamOptions | undefined)),
    getApiKey,
    toolExecution: 'parallel',
  })

  let responseText = ''
  let abortRequested = false
  agent.subscribe((event) => {
    for (const listener of listeners) {
      switch (event.type) {
        case 'message_update': {
          const inner = event.assistantMessageEvent
          if (inner.type === 'text_delta') {
            responseText += inner.delta
            listener({ type: 'text_delta', delta: inner.delta })
          } else if (inner.type === 'thinking_delta') {
            listener({ type: 'thinking_delta', delta: inner.delta })
          }
          break
        }
        case 'tool_execution_start':
          listener({ type: 'tool_start', callId: event.toolCallId, name: event.toolName, args: safeJson(event.args) })
          break
        case 'tool_execution_update':
          listener({ type: 'tool_progress', callId: event.toolCallId, message: summarize(event.partialResult) })
          break
        case 'tool_execution_end':
          listener({
            type: 'tool_result',
            callId: event.toolCallId,
            name: event.toolName,
            isError: Boolean(event.isError),
            content: safeJson(event.result),
          })
          break
        case 'turn_start':
          listener({ type: 'turn_start' })
          break
        case 'turn_end':
          listener({ type: 'turn_end' })
          break
        default:
          break
      }
    }
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async run(input) {
      responseText = ''
      abortRequested = false
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      for (const l of listeners) l({ type: 'run_start', runId })
      try {
        await agent.prompt(input)
        if (abortRequested || agent.signal?.aborted) {
          for (const l of listeners) l({ type: 'run_end', stopReason: 'cancelled', responseText })
          return { responseText, stopReason: 'cancelled' }
        }
        for (const l of listeners) l({ type: 'run_end', stopReason: 'completed', responseText })
        return { responseText, stopReason: 'completed' }
      } catch (err) {
        const normalized = normalizeError(err)
        for (const l of listeners) l({ type: 'run_end', stopReason: normalized.kind === 'cancelled' ? 'cancelled' : 'error', responseText, error: normalized })
        return { responseText, stopReason: normalized.kind === 'cancelled' ? 'cancelled' : 'error' }
      }
    },
    abort() {
      abortRequested = true
      agent.abort()
    },
    raw: agent,
  }
}

function safeJson(value: unknown): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Record<string, unknown>
  } catch {
    return { unparsable: true }
  }
}

function summarize(partial: unknown): string {
  if (partial && typeof partial === 'object' && 'content' in (partial as Record<string, unknown>)) {
    const content = (partial as { content?: unknown }).content
    if (Array.isArray(content)) {
      const text = content.find((c) => (c as { type?: string }).type === 'text')
      if (text && typeof (text as { text?: unknown }).text === 'string') return (text as { text: string }).text.slice(0, 200)
    }
  }
  return 'working'
}

export type { RuntimeEvent, RuntimeEventListener } from './types'
