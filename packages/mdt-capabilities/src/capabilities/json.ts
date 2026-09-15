/** `json` capability (tasklist P09.19) — structured errors, no eval. */
import type { Capability } from '../manifest'

export const jsonCapability: Capability = {
  manifest: {
    id: 'json',
    name: 'JSON',
    version: '1.0.0',
    category: 'data',
    description: 'Parse, stringify, validate and query JSON documents.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['parse', 'stringify', 'query'],
          description: 'json operation',
        },
        text: { type: 'string', description: 'JSON text for parse' },
        value: { description: 'JSON value for stringify' },
        path: { type: 'string', description: 'dot path for query, e.g. a.b.0.name' },
      },
      required: ['operation'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { result: {}, text: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
    permissions: [],
    secrets: [],
    ui: {
      icon: '{ }',
      accent: '#5b8def',
      summary: 'Parse, query and serialize JSON',
      keywords: ['json', 'parse', 'query'],
      doc: 'json',
    },
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(input) {
    const op = String(input.operation)
    switch (op) {
      case 'parse': {
        const text = String(input.text ?? '')
        let value: unknown
        try {
          value = JSON.parse(text)
        } catch (err) {
          throw new Error(`invalid JSON: ${(err as Error).message}`, { cause: err })
        }
        const picked = input.path === undefined ? value : queryPath(value, String(input.path))
        return { result: picked as Record<string, unknown>, text: JSON.stringify(picked) }
      }
      case 'stringify': {
        const text = JSON.stringify(input.value ?? null, null, 2)
        if (text === undefined) throw new Error('value contains no JSON representation (cyclic?)')
        return { text }
      }
      case 'query': {
        // query operates on an inline JSON value
        const picked = queryPath(input.value ?? null, String(input.path ?? ''))
        return { result: picked as Record<string, unknown>, text: JSON.stringify(picked) }
      }
      default:
        throw new Error(`unknown json operation "${op}"`)
    }
  },
}

/** Resolve a dot path ('a.b.0.name'); array indices are numeric segments. */
export function queryPath(value: unknown, path: string): unknown {
  if (path === '' || path === '.') return value
  let current: unknown = value
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) {
      throw new Error(`path "${path}" traverses null at "${segment}"`)
    }
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`path "${path}" has invalid array index "${segment}"`)
      }
      current = current[index]
      continue
    }
    if (typeof current !== 'object') {
      throw new Error(`path "${path}" cannot descend into non-object at "${segment}"`)
    }
    if (!(segment in (current as Record<string, unknown>))) {
      throw new Error(`path "${path}" has missing key "${segment}"`)
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
