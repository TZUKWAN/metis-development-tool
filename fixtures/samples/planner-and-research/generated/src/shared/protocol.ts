/**
 * Shared contract between the browser UI and the Node agent service
 * (ADR-0006 §3). These shapes mirror the MDT RuntimeEvent union
 * (`@mdt/pi-runtime` types.ts) — the UI consumes ONLY these events, never
 * Pi's raw AssistantMessageEvent union.
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
  | {
      type: 'tool_result'
      callId: string
      name: string
      isError: boolean
      content: Record<string, unknown>
    }
  | { type: 'turn_end' }
  | {
      type: 'run_end'
      stopReason: 'completed' | 'cancelled' | 'error'
      responseText: string
      error?: NormalizedError
    }

/** One chat transcript entry rendered by MdtChat. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
}

/** SSE frame: one JSON-encoded RuntimeEvent per `data:` line. */
export interface AgentRunRequest {
  message: string
  sessionId: string
}
