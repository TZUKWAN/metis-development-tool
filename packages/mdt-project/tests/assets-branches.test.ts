import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createId, emptyProject } from '@mdt/schema/testing'

import { AssetStore, acquireLock, releaseLock } from '../src/assets'
import { projectPaths } from '../src/layout'

let tmp: string
let root: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-assets-b-'))
  root = join(tmp, 'proj')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('AssetStore branch coverage (P05.06, P05.07)', () => {
  it('import() falls back to .bin for extension-less files', () => {
    const store = new AssetStore(root)
    const asset = store.import('README', new Uint8Array([1, 2]), createId)
    expect(asset.path).toMatch(/^assets\/[0-9a-f]{64}\.bin$/)
    expect(asset.mime).toBe('application/octet-stream')
  })

  it('import() maps unknown extensions to octet-stream and lowercases them', () => {
    const store = new AssetStore(root)
    const asset = store.import('data.XYZ', new Uint8Array([3]), createId)
    expect(asset.path).toMatch(/\.xyz$/)
    expect(asset.mime).toBe('application/octet-stream')
  })

  it('read() returns null for a missing file instead of throwing', () => {
    const store = new AssetStore(root)
    expect(store.read('assets/does-not-exist.png')).toBeNull()
  })

  it('gc() honors the keep list for in-flight imports', () => {
    const store = new AssetStore(root)
    const stale = store.import('stale.png', new Uint8Array([1]), createId)
    const inFlight = store.import('in-flight.png', new Uint8Array([2]), createId)
    const result = store.gc(emptyProject(), {
      keep: [inFlight.path.split('/')[1] as string],
    })
    expect(result.removed).toEqual([stale.path.split('/')[1]])
    expect(result.kept).toEqual([inFlight.path.split('/')[1]])
    expect(existsSync(join(root, stale.path))).toBe(false)
    expect(existsSync(join(root, inFlight.path))).toBe(true)
  })

  it('gc() on a project without an assets directory returns empty lists', () => {
    const store = new AssetStore(root) // nothing imported → assets/ absent
    const result = store.gc(emptyProject())
    expect(result).toEqual({ removed: [], kept: [] })
  })

  it('gc() ignores subdirectories inside assets/', () => {
    const store = new AssetStore(root)
    const stale = store.import('stale.png', new Uint8Array([1]), createId)
    mkdirSync(join(root, 'assets', 'nested'), { recursive: true })
    writeFileSync(join(root, 'assets', 'nested', 'note.txt'), 'not an asset file')
    const dry = store.gc(emptyProject(), { dryRun: true })
    expect(dry.removed).toEqual([stale.path.split('/')[1]]) // files only — no 'nested'
    expect(dry.kept).toEqual([])
    // real run deletes the stale file but never touches the subdirectory
    const result = store.gc(emptyProject())
    expect(result.removed).toEqual(dry.removed)
    expect(readFileSync(join(root, 'assets', 'nested', 'note.txt'), 'utf8')).toBe(
      'not an asset file',
    )
  })
})

describe('project lock edge branches (P05.08)', () => {
  const lockFor = (pid: number) => ({ pid, host: 'localhost', acquiredAt: 'now' })

  it('a corrupt lock file is treated as absent (the lock is claimable)', () => {
    mkdirSync(projectPaths(root).mdtDir, { recursive: true })
    writeFileSync(projectPaths(root).lockFile, 'not json {')
    expect(acquireLock(root, lockFor(process.pid)).ok).toBe(true)
  })

  it('releaseLock() of another pid’s lock must NOT delete it', () => {
    const me = lockFor(process.pid)
    expect(acquireLock(root, me).ok).toBe(true)
    // someone else (a different pid) tries to release MY lock → ignored
    releaseLock(root, lockFor(process.pid + 987))
    expect(existsSync(projectPaths(root).lockFile)).toBe(true)
    // and the lock is still held against a third party
    expect(acquireLock(root, lockFor(process.pid + 988)).ok).toBe(false)
    releaseLock(root, me)
    expect(existsSync(projectPaths(root).lockFile)).toBe(false)
  })

  it('releaseLock() without any lock file is a safe no-op', () => {
    expect(() => releaseLock(root, lockFor(process.pid))).not.toThrow()
  })
})
