/**
 * Codex bridge types (tasklist P10, ADR-0005).
 *
 * The renderer never spawns processes and never sees protocol details —
 * it consumes these typed events through IPC.
 */
import type { JsonValue } from '@mdt/schema'

export type CodexEvent =
  | { type: 'session_started'; sessionId: string; threadId?: string }
  | { type: 'agent_message_delta'; delta: string }
  | { type: 'command_started'; command: string }
  | { type: 'command_output'; text: string }
  | { type: 'command_completed'; exitCode: number | null }
  | { type: 'file_change_started' }
  | { type: 'file_change_completed'; files: string[] }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number }
  | { type: 'turn_completed'; status: 'completed' | 'interrupted' | 'failed'; error?: string }
  | { type: 'error'; message: string }
  | { type: 'session_ended' }

export type CodexEventListener = (event: CodexEvent) => void

export interface CodexTurnOptions {
  /** absolute path; the session is pinned here (P10.07 workspace isolation) */
  cwd: string
  sandbox?: 'read-only' | 'workspace-write'
  /** network access during the build (needed for npm install in repair loops) */
  networkAccess?: boolean
  model?: string
  /** hard wall-clock limit for the turn, ms */
  timeoutMs?: number
  signal?: AbortSignal
}

export interface CodexTurnResult {
  status: 'completed' | 'interrupted' | 'failed'
  responseText: string
  error?: string
}

/** Transport-agnostic Codex client. Implementations: app-server, exec, fake. */
export interface CodexClient {
  readonly kind: 'app-server' | 'exec' | 'fake'
  start(listener: CodexEventListener): Promise<void>
  /** Run one build turn with the given task prompt. */
  turn(prompt: string, options: CodexTurnOptions): Promise<CodexTurnResult>
  /** Best-effort interrupt of the active turn. */
  interrupt(): Promise<void>
  dispose(): Promise<void>
}

export interface CodexAvailability {
  installed: boolean
  version?: string
  loggedIn?: boolean
  /** warning when outside the verified range (P10.19) */
  compatWarning?: string
}

/** Codex versions MDT 1.0 has verified against (major.minor ranges). */
export const VERIFIED_VERSION_RANGE = '>=0.140.0 <0.200.0'
