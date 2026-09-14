import { describe, expect, it } from 'vitest'

import { blueprintHash, blueprintCanonicalJson, toBuildBlueprint } from '../src/blueprint'
import { stableStringify } from '../src/json'
import { parseProject } from '../src/parse'
import { createId } from '../src/ids'
import type { ProjectRoot } from '../src/project'
import { buttonElement, emptyProject, homePage, researchAgent, textElement } from './helpers'

function mustParse(raw: unknown): ProjectRoot {
  const result = parseProject(raw)
  if (!result.ok) throw new Error()
  return result.project
}

describe('stableStringify', () => {
  it('is key-order independent', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
    expect(stableStringify({ z: { y: [1, { k: 'v', j: 0 }] } })).toBe(
      stableStringify({ z: { y: [1, { j: 0, k: 'v' }] } }),
    )
  })
  it('preserves array order (semantically meaningful)', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })
})

describe('BuildBlueprint (P04.15)', () => {
  const buildProject = () =>
    emptyProject({
      pages: [homePage({ elements: [textElement(), buttonElement()] })],
      agents: [researchAgent()],
    })

  /** One concrete project instance; tests deep-clone from it so ids match. */
  const base = JSON.parse(JSON.stringify(buildProject()))

  it('same project content → same hash', () => {
    const a = toBuildBlueprint(mustParse(base))
    const clone = JSON.parse(JSON.stringify(base))
    // reorder object keys of a nested element to prove canonicalization
    const el = clone.pages[0].elements[0]
    clone.pages[0].elements[0] = Object.fromEntries(Object.entries(el).reverse())
    const b = toBuildBlueprint(mustParse(clone))
    expect(blueprintHash(a)).toBe(blueprintHash(b))
  })

  it('canvas position changes never change the hash (UI state excluded)', () => {
    const first = toBuildBlueprint(mustParse(base))
    const mutated = JSON.parse(JSON.stringify(base))
    mutated.pages[0].metadata.canvasPosition = { x: 4321, y: -123 }
    const second = toBuildBlueprint(mustParse(mutated))
    expect(blueprintHash(first)).toBe(blueprintHash(second))
  })

  it('semantic changes do change the hash', () => {
    const first = toBuildBlueprint(mustParse(base))
    const mutated = JSON.parse(JSON.stringify(base))
    mutated.pages[0].elements[1].visual.props.label = 'Search!'
    const second = toBuildBlueprint(mustParse(mutated))
    expect(blueprintHash(first)).not.toBe(blueprintHash(second))
  })

  it('canonical JSON is deterministic and stable-stringified', () => {
    const bp = toBuildBlueprint(mustParse(base))
    expect(blueprintCanonicalJson(bp)).toBe(blueprintCanonicalJson(bp))
    expect(blueprintCanonicalJson(bp)).not.toContain('updatedAt')
    expect(blueprintCanonicalJson(bp)).not.toContain('createdAt')
    expect(blueprintCanonicalJson(bp)).not.toContain('canvasPosition')
  })
})

describe('project ids survive round-trips', () => {
  it('duplicate pages get fresh ids but keep names', () => {
    const page = homePage()
    const copy = { ...JSON.parse(JSON.stringify(page)), id: createId(), name: 'Home copy' }
    expect(page.name).toBe('Home')
    expect(copy.id).not.toBe(page.id)
  })
})
