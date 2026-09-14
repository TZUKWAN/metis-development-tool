import { describe, expect, it } from 'vitest'

import {
  derivePages,
  elementIdFor,
  emptyOverlay,
  guessRole,
  overlayKey,
  pageIdFor,
} from '../src/index'
import type { DesignPageRef } from '../src/index'

let counter = 0
const newId = (): string => `test-${String(++counter).padStart(4, '0')}`

function slide(id: string, name: string): DesignPageRef {
  return {
    slideId: id,
    index: 0,
    name,
    elements: [
      {
        sourceId: `${id}-e1`,
        name: 'Title',
        kind: 'text',
        geometry: { x: 10, y: 10, width: 200, height: 40 },
        text: 'Welcome',
      },
      {
        sourceId: `${id}-btn`,
        name: 'Button 提交',
        kind: 'roundRect',
        geometry: { x: 10, y: 80, width: 120, height: 44 },
      },
    ],
  }
}

describe('derivePages (P03.08)', () => {
  it('assigns stable ids on first derivation and reuses them later', () => {
    const overlay = emptyOverlay()
    const first = derivePages([slide('s1', 'Home')], overlay, newId)
    const pageId = pageIdFor(first.overlay, 's1')
    const buttonId = elementIdFor(first.overlay, 's1', 's1-btn')
    expect(pageId).toBeDefined()
    expect(buttonId).toBeDefined()
    // second derivation with the returned overlay: identical ids
    const second = derivePages([slide('s1', 'Home')], first.overlay, newId)
    expect(pageIdFor(second.overlay, 's1')).toBe(pageId)
    expect(elementIdFor(second.overlay, 's1', 's1-btn')).toBe(buttonId)
    // and no new ids were minted
    expect(Object.keys(second.overlay.ids).length).toBe(Object.keys(first.overlay.ids).length)
  })

  it('renames and reorders never change identity', () => {
    const overlay = emptyOverlay()
    const a = derivePages([slide('s1', 'Home'), slide('s2', 'Results')], overlay, newId)
    const homeId = pageIdFor(a.overlay, 's1')
    const b = derivePages(
      [slide('s2', 'Results renamed'), slide('s1', 'Home v2')],
      a.overlay,
      newId,
    )
    expect(pageIdFor(b.overlay, 's1')).toBe(homeId)
  })

  it('duplicate slides keep the ORIGINAL element ids for the original, and the overlay keys are per slide', () => {
    // a duplicated slide has a new slideId, so it gets its own ids — semantics
    // are NOT silently shared between copies (they are copied explicitly by the UI)
    const overlay = emptyOverlay()
    const a = derivePages([slide('s1', 'Home')], overlay, newId)
    const b = derivePages([slide('s1', 'Home'), slide('s1-copy', 'Home copy')], a.overlay, newId)
    const originalPage = pageIdFor(b.overlay, 's1')
    const copyPage = pageIdFor(b.overlay, 's1-copy')
    expect(copyPage).not.toBe(originalPage)
    expect(elementIdFor(b.overlay, 's1-copy', 's1-btn')).toBeUndefined() // copy elements are new ids with copy sourceIds
  })

  it('garbage-collects overlay ids of deleted slides', () => {
    const overlay = emptyOverlay()
    const a = derivePages([slide('s1', 'Home'), slide('s2', 'Gone')], overlay, newId)
    const goneKey = overlayKey('s2', '')
    expect(a.overlay.ids[goneKey]).toBeDefined()
    const b = derivePages([slide('s1', 'Home')], a.overlay, newId)
    expect(b.overlay.ids[goneKey]).toBeUndefined()
  })

  it('role guesses: buttons/inputs/chat recognized, text fallback', () => {
    expect(guessRole('roundRect', 'Button 提交')).toBe('button')
    expect(guessRole('textbox', 'input-query')).toBe('input')
    expect(guessRole('frame', 'chat panel')).toBe('chat')
    expect(guessRole('text', 'Title', 'Hello')).toBe('text')
    expect(guessRole('roundRect', 'decor')).toBe('shape')
  })
})
