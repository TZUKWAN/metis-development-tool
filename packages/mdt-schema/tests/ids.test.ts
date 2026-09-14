import { describe, expect, it } from 'vitest'

import { createId, isId } from '../src/ids'

describe('createId (P04.12)', () => {
  it('generates 100k unique ids without collision', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100_000; i++) {
      const id = createId()
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
    expect(seen.size).toBe(100_000)
  })

  it('produces sortable, version-7 UUIDs', () => {
    const first = createId()
    const second = createId()
    expect(isId(first)).toBe(true)
    expect(isId(second)).toBe(true)
    expect(first < second).toBe(true) // time-ordered
    expect(first[14]).toBe('7') // version nibble
  })
})
