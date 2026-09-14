import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { createId, emptyProject } from '@mdt/schema/testing'

import { acquireLock, releaseLock } from '../src/assets'
import { AssetStore } from '../src/assets'
import { RecentProjects } from '../src/recent'

let root: string
let file: string

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), 'mdt-assets-')), 'proj')
  file = join(mkdtempSync(join(tmpdir(), 'mdt-recent-')), 'recent.json')
})

describe('AssetStore (P05.06, P05.07)', () => {
  it('imports bytes once and dedups by hash', () => {
    const store = new AssetStore(root)
    const bytes = new Uint8Array([1, 2, 3, 4])
    const first = store.import('logo.png', bytes, createId)
    const second = store.import('logo-again.png', bytes, createId)
    expect(first.deduped).toBe(false)
    expect(second.deduped).toBe(true)
    expect(first.path).toBe(second.path)
    expect(first.path).toMatch(/^assets\/[0-9a-f]{64}\.png$/)
    expect(first.mime).toBe('image/png')
    expect(first.originalName).toBe('logo.png')
    expect(existsSync(join(root, first.path))).toBe(true)
  })

  it('survives source file deletion (bytes are copied into the project)', () => {
    const { mkdirSync } = require('node:fs') as typeof import('node:fs')
    mkdirSync(root, { recursive: true })
    const src = join(root, 'src.png')
    writeFileSync(src, Buffer.from([9, 8, 7]))
    const store = new AssetStore(root)
    const asset = store.importFrom(src, createId)
    const { unlinkSync } = require('node:fs') as typeof import('node:fs')
    unlinkSync(src)
    expect(store.read(asset.path)?.[0]).toBe(9)
  })

  it('gc removes only unreferenced assets; dry-run does not delete', () => {
    const store = new AssetStore(root)
    const keep = store.import('kept.png', new Uint8Array([1]), createId)
    const drop = store.import('dropped.png', new Uint8Array([2]), createId)
    const project = emptyProject()
    project.assets.push({ ...keep, size: keep.size })
    const dry = store.gc(project, { dryRun: true })
    expect(dry.removed).toContain('dropped.png'.replace(/^/, '') && drop.path.split('/')[1])
    expect(existsSync(join(root, drop.path))).toBe(true)
    const real = store.gc(project)
    expect(real.removed).toHaveLength(1)
    expect(existsSync(join(root, drop.path))).toBe(false)
    expect(existsSync(join(root, keep.path))).toBe(true)
  })

  it('read rejects traversal outside assets/ (path safety)', () => {
    const store = new AssetStore(root)
    expect(store.read('../../etc/passwd')).toBeNull()
    expect(store.read('assets/../../../outside.png')).toBeNull()
    expect(store.resolve('assets/sub/../../x')).not.toBeNull() // still inside root → allowed by resolve
  })
})

describe('RecentProjects (P05.05)', () => {
  it('records, dedupes, prunes missing and removes entries', () => {
    const recent = new RecentProjects(file)
    recent.record('C:\\projects\\demo', 'Demo', '2026-09-15T10:00:00.000Z')
    recent.record('/home/x/other', 'Other')
    recent.record('c:\\PROJECTS\\demo', 'Demo again') // same dir, different case/format
    expect(recent.list()).toHaveLength(2)
    expect(recent.list()[0]?.name).toBe('Demo again')
    // missing directories can be pruned
    recent.pruneExisting()
    expect(recent.list()).toHaveLength(0)
    // remove of unknown path is safe
    recent.record('/home/x/other', 'Other')
    recent.remove('/does/not/exist')
    expect(recent.list()).toHaveLength(1)
  })

  it('tolerates a missing or corrupt store file', () => {
    const nested = join(file, '..', 'nested', 'recent.json')
    const recent = new RecentProjects(nested)
    expect(recent.list()).toEqual([])
    recent.record('/tmp/somewhere', 'S')
    expect(recent.list()).toHaveLength(1)
    writeFileSync(nested, 'not json')
    expect(new RecentProjects(nested).list()).toEqual([])
  })
})

describe('project lock (P05.08)', () => {
  it('blocks a second writer while the first is alive and releases cleanly', () => {
    const first = { pid: process.pid, host: 'localhost', acquiredAt: new Date().toISOString() }
    expect(acquireLock(root, first).ok).toBe(true)
    const second = {
      pid: process.pid + 4242,
      host: 'localhost',
      acquiredAt: new Date().toISOString(),
    }
    const conflict = acquireLock(root, second)
    expect(conflict.ok).toBe(false)
    expect(conflict.heldBy?.pid).toBe(process.pid)
    releaseLock(root, first)
    expect(acquireLock(root, second).ok).toBe(true)
  })

  it('reclaims a stale lock from a dead process (crash recovery)', () => {
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs')
    mkdirSync(join(root, '.mdt'), { recursive: true })
    const deadPid = 4_194_304
    // plant a lock from a (virtually never live) dead process
    writeFileSync(
      join(root, '.mdt', 'lock.json'),
      JSON.stringify({ pid: deadPid, host: 'ghost', acquiredAt: 'yesterday' }),
    )
    const me = { pid: process.pid, host: 'localhost', acquiredAt: new Date().toISOString() }
    expect(acquireLock(root, me).ok).toBe(true) // reclaimed
    // while alive, me excludes everyone else
    const other = { pid: process.pid + 1, host: 'localhost', acquiredAt: new Date().toISOString() }
    expect(acquireLock(root, other).ok).toBe(false)
    releaseLock(root, me)
    expect(acquireLock(root, other).ok).toBe(true)
  })
})
