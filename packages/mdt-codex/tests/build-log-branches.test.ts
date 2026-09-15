import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readdirSync } from 'node:fs'

import { BuildLog, rotateBuildLogs } from '../src/build-log'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-codex-log-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('build log edge branches (P10.17)', () => {
  it('readAll falls back to in-memory entries when the log file disappeared', () => {
    const buildsDir = join(tmp, 'builds')
    const log = new BuildLog(buildsDir, 'b1')
    log.append('applied', { commit: 'abc123' })
    unlinkSync(join(buildsDir, 'b1', 'log.jsonl'))
    const entries = log.readAll()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe('applied')
    expect(entries[0]?.data).toEqual({ commit: 'abc123' })
  })

  it('rotateBuildLogs on a missing builds directory is a no-op', () => {
    expect(() => rotateBuildLogs(join(tmp, 'never-created'), 5)).not.toThrow()
  })

  it('append without data defaults to an empty payload and keeps newest-first rotation', async () => {
    const buildsDir = join(tmp, 'builds')
    const log = new BuildLog(buildsDir, 'b9')
    log.append('build_started')
    const entries = log.readAll()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.data).toEqual({})
    // rotation keeps the NEWEST dir (by mtime) when limits are exceeded
    mkdirSync(join(buildsDir, 'older'), { recursive: true })
    writeFileSync(join(buildsDir, 'older', 'keep-me.txt'), 'old build artifacts')
    await new Promise((resolve) => setTimeout(resolve, 20)) // ensure distinct mtimes
    mkdirSync(join(buildsDir, 'newest'), { recursive: true })
    rotateBuildLogs(buildsDir, 1)
    expect(readdirSync(buildsDir)).toEqual(['newest'])
  })
})
