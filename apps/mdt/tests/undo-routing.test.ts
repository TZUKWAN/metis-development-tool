import { describe, expect, it } from 'vitest'
import { isTextUndoTarget } from '../src/renderer/undo-routing'

function target(tagName: string, attributes: Record<string, string> = {}) {
  return {
    tagName,
    isContentEditable: false,
    getAttribute: (name: string) => attributes[name] ?? null,
  }
}

describe('Slides undo shortcut routing', () => {
  it('treats inputs, textareas and editable text as native-undo targets', () => {
    expect(isTextUndoTarget(target('INPUT'))).toBe(true)
    expect(isTextUndoTarget(target('TEXTAREA'))).toBe(true)
    expect(isTextUndoTarget({ isContentEditable: true })).toBe(true)
    expect(isTextUndoTarget(target('DIV'))).toBe(false)
    expect(isTextUndoTarget(null)).toBe(false)
  })
})
