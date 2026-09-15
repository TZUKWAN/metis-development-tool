import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RecentProjects } from '../src/recent'

let tmp: string
let file: string
let realDir: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-recent-'))
  file = join(tmp, 'recent.json')
  realDir = join(tmp, 'a-real-project')
  mkdirSync(realDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('RecentProjects branches (P05.05)', () => {
  it('record() dedupes canonical paths (hit) and appends new ones (miss)', () => {
    const recent = new RecentProjects(file)
    expect(recent.record('C:\\projects\\demo', 'Demo', '2026-09-15T10:00:00.000Z')).toHaveLength(1)
    // dedupe HIT: same directory, different spelling — entry moves to front
    recent.record('c:\\PROJECTS\\demo', 'Demo (again)', '2026-09-15T11:00:00.000Z')
    // dedupe MISS: a genuinely new directory
    recent.record(join(realDir), 'Real', '2026-09-15T12:00:00.000Z')
    const list = recent.list()
    expect(list).toHaveLength(2)
    expect(list[0]?.name).toBe('Real')
    expect(list[1]?.lastOpenedAt).toBe('2026-09-15T11:00:00.000Z')
    const stored = JSON.parse(readFileSync(file, 'utf8')) as { entries: unknown[] }
    expect(stored.entries).toHaveLength(2)
  })

  it('remove() of an unknown path leaves the rest untouched', () => {
    const recent = new RecentProjects(file)
    recent.record(join(realDir), 'Real', 't1')
    recent.record('C:\\elsewhere', 'Else', 't2')
    expect(recent.remove('Z:\\never-recorded')).toHaveLength(2)
    expect(recent.remove('c:\\ELSEWHERE')).toHaveLength(1)
    expect(recent.list()[0]?.name).toBe('Real')
  })

  it('pruneExisting() keeps existing dirs, drops missing ones (mixed)', () => {
    const recent = new RecentProjects(file)
    recent.record(join(realDir), 'Real', 't1')
    recent.record('C:\\vanished\\project', 'Ghost', 't2')
    const pruned = recent.pruneExisting()
    expect(pruned.map((e) => e.name)).toEqual(['Real'])
    expect(recent.list().map((e) => e.name)).toEqual(['Real'])
  })

  it('pruneExisting() persists nothing when there is nothing to prune', () => {
    const recent = new RecentProjects(file)
    recent.record(join(realDir), 'Real', 't1')
    const before = readFileSync(file, 'utf8')
    expect(recent.pruneExisting().map((e) => e.name)).toEqual(['Real'])
    expect(readFileSync(file, 'utf8')).toBe(before) // unchanged on disk
  })

  it('list() tolerates corrupt, empty, and entries-less store files', () => {
    writeFileSync(file, '{ not json')
    expect(new RecentProjects(file).list()).toEqual([])
    writeFileSync(file, '') // empty file → JSON.parse throws → []
    expect(new RecentProjects(file).list()).toEqual([])
    writeFileSync(file, JSON.stringify({})) // valid JSON without `entries` → ?? []
    expect(new RecentProjects(file).list()).toEqual([])
  })

  it('list() filters entries whose path is not a string', () => {
    writeFileSync(
      file,
      JSON.stringify({
        entries: [
          { path: 42, name: 'numeric path', lastOpenedAt: 't0' },
          { path: realDir, name: 'Real', lastOpenedAt: 't1' },
        ],
      }),
    )
    const list = new RecentProjects(file).list()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Real')
  })
})
