/** JSON value model + deterministic serialization helpers (tasklist P04.15). */
import { z } from 'zod'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/** Recursive JSON value schema (used for adapter-owned payloads and configs). */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
) as z.ZodType<JsonValue>

/** JSON object with string keys. */
export const JsonObjectSchema: z.ZodType<{ [k: string]: JsonValue }> = z.record(
  z.string(),
  JsonValueSchema,
) as z.ZodType<{ [k: string]: JsonValue }>

/**
 * Deterministic JSON serialization: object keys sorted recursively, arrays
 * keep order, no whitespace. Same logical value → same bytes → same hash.
 * This is what makes repeated Blueprint generation produce stable diffs.
 */
export function stableStringify(value: JsonValue | undefined): string {
  if (value === undefined) return 'null'
  return (function walk(v: JsonValue): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
    const body = keys.map((k) => `${JSON.stringify(k)}:${walk(v[k])}`).join(',')
    return `{${body}}`
  })(value)
}
