/** Deterministic naming helpers: slugs, PascalCase, stable JSON. */

export function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug === '') return 'page'
  if (/^[0-9]/.test(slug)) return `p-${slug}`
  return slug
}

export function pascalCase(raw: string): string {
  return raw
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

/** Deduplicate: first caller wins the base slug, later ones get -2, -3, … */
export class SlugAllocator {
  private readonly used = new Set<string>()
  allocate(base: string): string {
    let candidate = base
    let n = 2
    while (this.used.has(candidate)) {
      candidate = `${base}-${n}`
      n += 1
    }
    this.used.add(candidate)
    return candidate
  }
}

/** JSON.stringify with sorted object keys (recursive) — stable across runs. */
export function stableJson(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  const padInner = '  '.repeat(indent + 1)
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => `${padInner}${stableJson(item, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null'
    case 'boolean':
      return value ? 'true' : 'false'
    case 'object': {
      const record = value as Record<string, unknown>
      const keys = Object.keys(record).sort()
      if (keys.length === 0) return '{}'
      const items = keys.map(
        (key) => `${padInner}${JSON.stringify(key)}: ${stableJson(record[key], indent + 1)}`,
      )
      return `{\n${items.join(',\n')}\n${pad}}`
    }
    default:
      return 'null' // undefined / functions / symbols never enter generated files
  }
}

/** Compact stable JSON (single line) for inline literals. */
export function stableJsonCompact(value: unknown): string {
  return stableJson(value).replace(/\s+/g, ' ').replace(/\{\s}/g, '{}').replace(/\[\s]/g, '[]')
}

/** Single-quote a TypeScript string literal safely. */
export function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`
}

/** Count the 1-based line of the first occurrence of `marker` in `content`. */
export function lineOf(content: string, marker: string): number | undefined {
  const index = content.indexOf(marker)
  if (index < 0) return undefined
  let line = 1
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') line += 1
  }
  return line
}
