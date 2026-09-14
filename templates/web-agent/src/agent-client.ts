/**
 * Agent client (browser side): SSE streaming against the local agent
 * service, with cancellation. All requests go through the `/api` proxy.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatMessage, RuntimeEvent } from './shared/protocol'

/** Stable per-browser session id (persists across reloads). */
export function getSessionId(): string {
  const KEY = 'mdt:session-id'
  let id = window.localStorage.getItem(KEY)
  if (!id) {
    id = `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    window.localStorage.setItem(KEY, id)
  }
  return id
}

export interface RunHandle {
  /** resolves with the final assistant text after run_end */
  done: Promise<string>
  cancel: () => void
}

/**
 * POST /api/agent/:agentId/run and stream the SSE RuntimeEvent frames.
 * Rejects on transport errors; run-level errors arrive as run_end events.
 */
export function runAgent(options: {
  agentId: string
  message: string
  sessionId?: string
  onEvent?: (event: RuntimeEvent) => void
  signal?: AbortSignal
}): RunHandle {
  const { agentId, message, onEvent } = options
  const sessionId = options.sessionId ?? getSessionId()
  const controller = new AbortController()
  const cancel = (): void => {
    controller.abort()
    void cancelAgent(agentId, sessionId)
  }
  const done = (async (): Promise<string> => {
    const response = await fetch(`/api/agent/${encodeURIComponent(agentId)}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, sessionId } satisfies { message: string; sessionId: string }),
      signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(`agent request failed: HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalText = ''
    for (;;) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })
      let separator = buffer.indexOf('\n')
      while (separator >= 0) {
        const line = buffer.slice(0, separator).replace(/\r$/, '')
        buffer = buffer.slice(separator + 1)
        separator = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (payload === '') continue
        let event: RuntimeEvent
        try {
          event = JSON.parse(payload) as RuntimeEvent
        } catch {
          continue // ignore malformed keep-alive lines
        }
        if (event.type === 'run_end') finalText = event.responseText
        onEvent?.(event)
      }
    }
    return finalText
  })()
  return { done, cancel }
}

/** POST /api/agent/:agentId/cancel — aborts the active run server-side. */
export async function cancelAgent(agentId: string, sessionId?: string): Promise<void> {
  try {
    await fetch(`/api/agent/${encodeURIComponent(agentId)}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId ?? getSessionId() }),
    })
  } catch {
    // cancel is best-effort; an already-finished run 404s harmlessly
  }
}

/** POST /api/capability/:instanceId — direct capability invocation. */
export async function invokeCapability(
  instanceId: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/capability/${encodeURIComponent(instanceId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
    signal,
  })
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    content?: Record<string, unknown>
    error?: string
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(body.error ?? `capability invoke failed: HTTP ${response.status}`)
  }
  return body.content ?? {}
}

export interface AgentRunState {
  messages: ChatMessage[]
  running: boolean
  lastResponse: string
  error: string | null
  send: (message: string) => void
  cancel: () => void
}

/**
 * React hook binding one chat element to one agent: manages the transcript,
 * streams text deltas into the pending assistant bubble and exposes cancel.
 */
export function useAgentRun(agentId: string): AgentRunState {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const [lastResponse, setLastResponse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  useEffect(() => () => abortRef.current?.(), [])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '' || running) return
      setError(null)
      setMessages([...messagesRef.current, { role: 'user', text: trimmed }, { role: 'assistant', text: '', pending: true }])
      setRunning(true)
      let streaming = ''
      const handle = runAgent({
        agentId,
        message: trimmed,
        onEvent: (event) => {
          if (event.type === 'text_delta') {
            streaming += event.delta
            setMessages((prev) => {
              const next = [...prev]
              next[next.length - 1] = { role: 'assistant', text: streaming, pending: true }
              return next
            })
          } else if (event.type === 'run_end') {
            setMessages((prev) => {
              const next = [...prev]
              const finalText = event.responseText !== '' ? event.responseText : streaming
              next[next.length - 1] = { role: 'assistant', text: finalText }
              return next
            })
            setLastResponse(event.responseText)
            if (event.stopReason === 'error') setError(event.error?.message ?? 'agent run failed')
          }
        },
      })
      abortRef.current = handle.cancel
      void handle.done
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant' && last.text === '') {
              next[next.length - 1] = { role: 'assistant', text: '(request failed)' }
            }
            return next
          })
        })
        .finally(() => {
          setRunning(false)
          abortRef.current = null
        })
    },
    [agentId, running],
  )

  const cancel = useCallback(() => {
    abortRef.current?.()
  }, [])

  return { messages, running, lastResponse, error, send, cancel }
}
