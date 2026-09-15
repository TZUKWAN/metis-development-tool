import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  WorkspaceError,
  applyBuild,
  commitBuild,
  discardBuild,
  prepareWorkspace,
  rollbackBuild,
} from '../src/build-workspace'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-codex-ws-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function commitAll(root: string, message: string): string {
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, 'commit', '-m', message])
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

describe('build workspace error surfaces (P10.07, P10.12)', () => {
  it('prepareWorkspace on a missing directory throws a typed WorkspaceError', () => {
    const missing = join(tmp, 'nope')
    expect(() => prepareWorkspace(missing, 'b1')).toThrow(WorkspaceError)
    expect(() => prepareWorkspace(missing, 'b1')).toThrow(/does not exist/)
  })

  it('a git failure (file in place of the workspace) surfaces as WorkspaceError', () => {
    const fileRoot = join(tmp, 'just-a-file')
    writeFileSync(fileRoot, 'not a directory')
    expect(() => prepareWorkspace(fileRoot, 'b1')).toThrow(WorkspaceError)
    expect(() => prepareWorkspace(fileRoot, 'b1')).toThrow(/git init failed/)
  })

  it('commitBuild with an unchanged tree resolves to the base commit (empty diff)', () => {
    const root = join(tmp, 'clean')
    mkdirSync(root, { recursive: true })
    const ws = prepareWorkspace(root, 'b1')
    expect(commitBuild(ws, 'feat: nothing changed')).toBe(ws.baseCommit)
  })

  it('applyBuild refuses to fast-forward when main advanced during the build', () => {
    const root = join(tmp, 'conflict')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'app.ts'), 'export const v1 = 1\n')
    const ws = prepareWorkspace(root, 'b1')
    writeFileSync(join(root, 'app.ts'), 'export const v2 = 2\n')
    const buildCommit = commitBuild(ws, 'feat: v2')
    // meanwhile main moves forward (a hotfix landed while the build ran)
    execFileSync('git', ['-C', root, 'checkout', 'main'])
    writeFileSync(join(root, 'hotfix.txt'), 'urgent\n')
    commitAll(root, 'fix: hotfix on main')
    const applied = applyBuild(ws, buildCommit, 'b1')
    expect(applied.ok).toBe(false)
    expect(applied.error).toContain('main advanced')
    expect(applied.knownGoodTag).toBeUndefined()
  })
})

describe('rollbackBuild branches (P10.13)', () => {
  it('reports "nothing to roll back to" for a repo with a single commit and no tags', () => {
    const root = join(tmp, 'fresh')
    mkdirSync(root, { recursive: true })
    const ws = prepareWorkspace(root, 'b1')
    expect(ws.alreadyInitialized).toBe(false)
    const rolled = rollbackBuild(root)
    expect(rolled.ok).toBe(false)
    expect(rolled.error).toContain('nothing to roll back')
  })

  it('falls back to HEAD~1 when the newest known-good tag IS the head commit', () => {
    const root = join(tmp, 'head-eq-tag')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'app.ts'), 'export const v1 = 1\n')
    const ws = prepareWorkspace(root, 'b1')
    writeFileSync(join(root, 'app.ts'), 'export const v2 = 2\n')
    const applied = applyBuild(ws, commitBuild(ws, 'feat: v2'), 'b1')
    expect(applied.ok).toBe(true)
    // HEAD now equals the newest (and only) tag → revert one commit instead
    const rolled = rollbackBuild(root)
    expect(rolled.ok).toBe(true)
    expect(rolled.revertedTo).toBe(ws.baseCommit)
  })

  it('reports a typed failure when the target is not a git repository', () => {
    const rolled = rollbackBuild(join(tmp, 'not-a-repo'))
    expect(rolled.ok).toBe(false)
    expect(rolled.error).toBeDefined()
    expect(rolled.revertedTo).toBeUndefined()
  })

  it('prepareWorkspace reuses an initialized repo; discardBuild removes the branch', () => {
    const root = join(tmp, 'reuse')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'app.ts'), 'export const v1 = 1\n')
    const first = prepareWorkspace(root, 'b1')
    discardBuild(first)
    const second = prepareWorkspace(root, 'b2')
    expect(second.alreadyInitialized).toBe(true)
    expect(second.baseCommit).toBe(first.baseCommit)
    expect(second.branch).toBe('mdt-build/b2')
  })
})
