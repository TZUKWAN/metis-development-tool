import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { emptyProject } from '@mdt/schema/testing'

import { AutosaveController } from '../src/autosave'

let tmp: string
let root: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-autosave-b-'))
  root = join(tmp, 'proj')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('AutosaveController state transitions', () => {
  it('flush() before any touch is a no-op', () => {
    const c = new AutosaveController(root, { debounceMs: 5, writeFile: () => {} })
    expect(() => c.flush()).not.toThrow()
    expect(c.state.dirty).toBe(false)
    expect(c.state.lastSavedAt).toBeUndefined()
  })

  it('touch → flush → touch → markSaved → flush stays consistent', () => {
    const writes: string[] = []
    const c = new AutosaveController(root, {
      debounceMs: 5,
      writeFile: (file, json) => writes.push(`${file}:${json.length}`),
    })
    c.touch(emptyProject({ name: 'first' }))
    expect(c.state.dirty).toBe(true)
    c.flush()
    expect(c.state.dirty).toBe(false)
    expect(c.state.lastSavedAt).toBeTypeOf('number')
    expect(writes).toHaveLength(1)
    // second dirty window is cancelled by the normal save path winning
    c.touch(emptyProject({ name: 'second' }))
    expect(c.state.dirty).toBe(true)
    c.markSaved()
    expect(c.state.dirty).toBe(false)
    c.flush() // no pending work left → no second write
    expect(writes).toHaveLength(1)
  })

  it('continuous editing caps the total delay (maxDelay branch) and still writes once', async () => {
    let now = 0
    const writes: string[] = []
    const c = new AutosaveController(root, {
      debounceMs: 60,
      maxDelayMs: 100,
      writeFile: (file, json) => writes.push(json),
      now: () => now,
    })
    const project = emptyProject()
    c.touch(project) // schedules the initial debounce timer
    await sleep(20)
    now = 50 // >= maxDelayMs - debounceMs → second touch takes the cap branch
    c.touch(project) // re-armed to fire in scheduledAt - now = 10ms
    expect(c.state.dirty).toBe(true)
    await sleep(150)
    expect(writes).toHaveLength(1)
    expect(c.state.dirty).toBe(false)
  })

  it('dispose() cancels a pending debounce timer (nothing writes afterwards)', async () => {
    let writes = 0
    const c = new AutosaveController(root, {
      debounceMs: 30,
      writeFile: () => writes++,
    })
    c.touch(emptyProject())
    c.dispose()
    await sleep(80)
    expect(writes).toBe(0)
    // disposing again without any timer is also safe
    expect(() => c.dispose()).not.toThrow()
  })
})
