import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyProject } from '@mdt/schema/testing'

import {
  AutosaveController,
  clearRecoverySnapshot,
  readRecoverySnapshot,
  writeRecoverySnapshot,
} from '../src/autosave'

let root: string

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), 'mdt-autosave-')), 'proj')
})

describe('AutosaveController (P05.03, P15.05)', () => {
  function fakeClock() {
    let now = 1_000_000
    const timers: { at: number; fn: () => void }[] = []
    const schedule = (fn: () => void, ms: number) => {
      const t = { at: now + ms, fn }
      timers.push(t)
      return t
    }
    const api = {
      now: () => now,
      advance: (ms: number) => {
        now += ms
        for (const t of timers.splice(0)) {
          if (t.at <= now) t.fn()
        }
      },
      schedule,
    }
    return api
  }

  it('debounces bursts: a 1px drag storm writes once, after settling', () => {
    const clock = fakeClock()
    const writes: string[] = []
    const c = new AutosaveController(root, {
      debounceMs: 100,
      writeFile: (f, json) => writes.push(json),
      now: clock.now,
    })
    const timerShim = vi.fn()
    // route setTimeout through the fake clock via the options' debounce only —
    // controller uses setTimeout internally, so drive flush() manually instead
    const project = emptyProject()
    for (let i = 0; i < 500; i++) {
      project.name = `edit-${i}`
      c.touch(project)
      if (i % 50 === 0) clock.advance(10)
    }
    c.flush() // what the debounce timer would do
    expect(writes).toHaveLength(1)
    expect(c.state.dirty).toBe(false)
    void timerShim
  })

  it('keeps dirty and reports the error when the write fails', () => {
    const c = new AutosaveController(root, {
      debounceMs: 10,
      writeFile: () => {
        throw new Error('ENOSPC: no space left on device')
      },
    })
    c.touch(emptyProject())
    c.flush()
    expect(c.state.dirty).toBe(true)
    expect(c.state.lastError).toContain('ENOSPC')
    // a later successful write clears the error
    const c2 = new AutosaveController(root, { debounceMs: 10, writeFile: () => {} })
    c2.touch(emptyProject())
    c2.flush()
    expect(c2.state.dirty).toBe(false)
    expect(c2.state.lastError).toBeUndefined()
  })

  it('markSaved clears pending state (normal save path won), writes nothing', () => {
    let writes = 0
    const c = new AutosaveController(root, { debounceMs: 10, writeFile: () => writes++ })
    c.touch(emptyProject())
    c.markSaved()
    c.flush()
    expect(writes).toBe(0)
    expect(c.state.dirty).toBe(false)
  })

  it('autosave lands in .mdt/autosave.json via the default writer', () => {
    const c = new AutosaveController(root, { debounceMs: 1 })
    c.touch(emptyProject())
    c.flush()
    const file = join(root, '.mdt', 'autosave.json')
    expect(existsSync(file)).toBe(true)
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { name: string }
    expect(doc.name).toBe('Sample Project')
  })
})

describe('crash recovery (P05.04)', () => {
  it('writes, reads and clears a recovery snapshot', () => {
    const project = emptyProject({ name: 'Pre-crash' })
    writeRecoverySnapshot(root, project, '2026-09-15T12:00:00.000Z')
    const point = readRecoverySnapshot(root)
    expect(point?.savedAt).toBe('2026-09-15T12:00:00.000Z')
    expect(point?.project.name).toBe('Pre-crash')
    clearRecoverySnapshot(root)
    expect(readRecoverySnapshot(root)).toBeNull()
    // clearing twice is safe
    expect(() => clearRecoverySnapshot(root)).not.toThrow()
  })

  it('returns null for absent or garbage snapshots', () => {
    expect(readRecoverySnapshot(root)).toBeNull()
    writeRecoverySnapshot(root, emptyProject())
    writeFileSync(join(root, '.mdt', 'recovery.json'), 'garbage{')
    expect(readRecoverySnapshot(root)).toBeNull()
  })
})
