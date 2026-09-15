/**
 * Self-contained `json` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/json.js).
 * Structured errors, no eval.
 */

/** Resolve a dot path ('a.b.0.name'); array indices are numeric segments. */
export function queryPath(value, path) {
  if (path === '' || path === '.') return value
  let current = value
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
    if (!(segment in current)) {
      throw new Error(`path "${path}" has missing key "${segment}"`)
    }
    current = current[segment]
  }
  return current
}

export async function execute(input) {
  const op = String(input.operation)
  switch (op) {
    case 'parse': {
      const text = String(input.text ?? '')
      let value
      try {
        value = JSON.parse(text)
      } catch (err) {
        throw new Error(`invalid JSON: ${err.message}`, { cause: err })
      }
      const picked = input.path === undefined ? value : queryPath(value, String(input.path))
      return { result: picked, text: JSON.stringify(picked) }
    }
    case 'stringify': {
      const text = JSON.stringify(input.value ?? null, null, 2)
      if (text === undefined) throw new Error('value contains no JSON representation (cyclic?)')
      return { text }
    }
    case 'query': {
      const picked = queryPath(input.value ?? null, String(input.path ?? ''))
      return { result: picked, text: JSON.stringify(picked) }
    }
    default:
      throw new Error(`unknown json operation "${op}"`)
  }
}
