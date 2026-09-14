/**
 * MDT runtime event model (tasklist P08.10).
 *
 * The generated app's UI consumes THESE events — never Pi's raw
 * AssistantMessageEvent union. The adapter (src/adapter.ts) owns the
 * mapping, so a future Pi API change cannot leak into generated apps.
 */
export type ErrorKind = 'provider' | 'tool' | 'timeout' | 'validation' | 'cancelled' | 'unknown'

export interface NormalizedError {
  kind: ErrorKind
  message: string
  detail?: Record<string, unknown>
}

export type RuntimeEvent =
  | { type: 'run_start'; runId: string }
  | { type: 'turn_start' }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_start'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_progress'; callId: string; message: string }
  | { type: 'tool_result'; callId: string; name: string; isError: boolean; content: Record<string, unknown> }
  | { type: 'turn_end' }
  | { type: 'run_end'; stopReason: 'completed' | 'cancelled' | 'error'; responseText: string; error?: NormalizedError }

export type RuntimeEventListener = (event: RuntimeEvent) => void

/** Agent configuration projected from the MDT blueprint (P11.09). */
export interface AgentConfig {
  id: string
  name: string
  instructions: string
  modelPolicy: {
    provider: string
    model: string
    baseUrl?: string
    temperature?: number
    maxTokens?: number
    api: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-gemini'
    compat?: {
      supportsDeveloperRole?: boolean
      supportsReasoningEffort?: boolean
      supportsStrictMode?: boolean
    }
  }
  memory: { enabled: boolean; maxTurns?: number }
}

/** A tool registered into the runtime (built from a capability instance). */
export interface RegisteredTool {
  name: string
  description: string
  /** JSON Schema object (TypeBox schemas are JSON Schema at runtime) */
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, signal: AbortSignal, onProgress: (message: string) => void) => Promise<{ content: Record<string, unknown>; isError?: boolean }>
}
