/**
 * Runtime error normalization (tasklist P08.13): provider, tool, timeout,
 * validation and cancellation failures all map onto one shape so generated
 * UIs never render `undefined` / `[object Object]`.
 */
import type { ErrorKind, NormalizedError } from './types'

export function normalizeError(err: unknown): NormalizedError {
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

function classify(message: string, err: Error | undefined): ErrorKind {
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
