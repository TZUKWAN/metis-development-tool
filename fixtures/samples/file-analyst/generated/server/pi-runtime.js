/**
 * Pi Agent Core runtime for the generated app (plain ESM JavaScript — zero
 * build step, `node server/index.js` just works).
 *
 * This is the MDT adapter contract from `@mdt/pi-runtime` (ADR-0004),
 * inlined into the generated app so the app has NO dependency on MDT
 * packages (P11.21): blueprint-configured agents in, normalized
 * RuntimeEvents out. Pi owns the agent loop; we only translate
 * configuration and events at the boundary.
 *
 * Pi constraints honored here (docs/upstream/PI_BASELINE.md):
 *  - ESM only (`"type": "module"`), Node >= 20
 *  - `streamFn` is REQUIRED at 0.85.1 — we pass `streamSimple`
 *    from `@earendil-works/pi-ai/compat`
 *  - tools THROW on failure (Pi converts the throw into an isError tool
 *    result); we never return error text as content
 *  - custom providers get no env-var fallback: `getApiKey` is wired from
 *    this app's own environment
 */
import { Agent } from '@earendil-works/pi-agent-core'
import { streamSimple } from '@earendil-works/pi-ai/compat'

/**
 * Map an MDT model policy onto a pi-ai Model object, including the
 * endpoint-quirk `compat` flags from the blueprint.
 */
export function modelFromPolicy(policy) {
  return {
    id: policy.model,
    name: policy.model,
    // the endpoint's API shape comes from the blueprint; the runtime
    // validates server-side anyway
    api: policy.api,
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
}

/** MDT registered tool → Pi AgentTool (manifest JSON Schema passes through). */
export function toolFromRegistered(tool) {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (toolCallId, rawParams, signal, onUpdate) => {
      onUpdate?.({ content: [{ type: 'text', text: 'running' }], details: {} })
      // Contract: a failing tool THROWS. Catching here would hide the
      // failure from both the model and the UI.
      const result = await tool.execute(
        rawParams ?? {},
        signal ?? new AbortController().signal,
        (message) => onUpdate?.({ content: [{ type: 'text', text: message }], details: {} }),
      )
      if (result.isError) {
        throw new Error(extractText(result.content))
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result.content) }],
        details: result.content,
      }
    },
  }
}

function extractText(content) {
  if (content && typeof content.error === 'string') return content.error
  return JSON.stringify(content).slice(0, 500)
}

/** Runtime error normalization: provider/tool/timeout/cancel/etc. kinds. */
export function normalizeError(err) {
  if (err instanceof Error) {
    const message = err.message.trim() || err.name
    return { kind: classify(message, err), message, detail: { name: err.name } }
  }
  if (typeof err === 'string') return { kind: classify(err, undefined), message: err }
  try {
    return { kind: 'unknown', message: JSON.stringify(err) ?? 'unknown runtime error' }
  } catch {
    return { kind: 'unknown', message: 'unknown runtime error' }
  }
}

function classify(message, err) {
  const lower = message.toLowerCase()
  if (err?.name === 'AbortError' || lower.includes('aborted') || lower.includes('cancelled'))
    return 'cancelled'
  if (lower.includes('timeout') || lower.includes('etimedout')) return 'timeout'
  if (lower.startsWith('tool_error:') || lower.includes('tool execution')) return 'tool'
  if (
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('fetch failed') ||
    lower.includes('rate limit')
  ) {
    return 'provider'
  }
  if (lower.includes('invalid') || lower.includes('schema') || lower.includes('validation'))
    return 'validation'
  return 'unknown'
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null))
  } catch {
    return { unparsable: true }
  }
}

function summarize(partial) {
  if (partial && typeof partial === 'object' && 'content' in partial) {
    const content = partial.content
    if (Array.isArray(content)) {
      const text = content.find((c) => c?.type === 'text')
      if (text && typeof text.text === 'string') return text.text.slice(0, 200)
    }
  }
  return 'working'
}

/**
 * Create a runtime agent: subscribe() → normalized RuntimeEvents,
 * run(input) → { responseText, stopReason }, abort() → cancel.
 *
 * `options.streamFn` is a test seam (scripted/mock provider, no network);
 * production uses streamSimple against the configured endpoint.
 */
export function createRuntimeAgent(options) {
  const { config, tools, getApiKey, streamFn } = options
  const model = modelFromPolicy(config.modelPolicy)
  const listeners = new Set()

  const agent = new Agent({
    initialState: {
      systemPrompt: config.instructions,
      model,
      tools: tools.map(toolFromRegistered),
      messages: [],
    },
    streamFn:
      streamFn ??
      ((modelArg, context, opts) => streamSimple(modelArg, context, opts ?? undefined)),
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
          listener({
            type: 'tool_start',
            callId: event.toolCallId,
            name: event.toolName,
            args: safeJson(event.args),
          })
          break
        case 'tool_execution_update':
          listener({
            type: 'tool_progress',
            callId: event.toolCallId,
            message: summarize(event.partialResult),
          })
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
      for (const listener of listeners) listener({ type: 'run_start', runId })
      try {
        await agent.prompt(input)
        if (abortRequested || agent.signal?.aborted) {
          for (const listener of listeners)
            listener({ type: 'run_end', stopReason: 'cancelled', responseText })
          return { responseText, stopReason: 'cancelled' }
        }
        for (const listener of listeners)
          listener({ type: 'run_end', stopReason: 'completed', responseText })
        return { responseText, stopReason: 'completed' }
      } catch (err) {
        const normalized = normalizeError(err)
        for (const listener of listeners) {
          listener({
            type: 'run_end',
            stopReason: normalized.kind === 'cancelled' ? 'cancelled' : 'error',
            responseText,
            error: normalized,
          })
        }
        return {
          responseText,
          stopReason: normalized.kind === 'cancelled' ? 'cancelled' : 'error',
        }
      }
    },
    abort() {
      abortRequested = true
      agent.abort()
    },
    get raw() {
      return agent
    },
  }
}
