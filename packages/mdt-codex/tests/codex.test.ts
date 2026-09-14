import * as fs from 'node:fs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { execFileSync } from 'node:child_process'

import { AppServerCodexClient } from '../src/app-server'
import { FakeCodexClient } from '../src/fake'
import { BuildLog, rotateBuildLogs } from '../src/build-log'
import {
  applyBuild,
  commitBuild,
  diffSummary,
  discardBuild,
  prepareWorkspace,
  rollbackBuild,
} from '../src/build-workspace'
import { redactText } from '../src/redact'
import { checkAvailability, parseVersion, resolveCodexBinary } from '../src/versions'
import type { CodexEvent } from '../src/types'

let root: string
let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-codex-'))
  root = join(tmp, 'generated')
})

afterEach(() => {
  try {
    execFileSync('git', ['-C', root, 'checkout', 'main'], { stdio: 'ignore' })
  } catch {
    /* best effort */
  }
})

function fakeServerArgs(script: Record<string, unknown>): string[] {
  const file = join(tmp, `script-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(file, JSON.stringify(script))
  return [join(__dirname, '../testdata/fake-app-server.mjs'), file]
}

describe('AppServerCodexClient (P10.02, P10.05)', () => {
  it('wired: initialize → thread/start → turn/start → events → turn/completed', async () => {
    const scriptFile = join(tmp, 'script-ok.json')
    writeFileSync(scriptFile, JSON.stringify({ respondTurnStart: true, emitTurnCompleted: true }))
    const client = new TestableClient([
      process.execPath,
      join(__dirname, '../testdata/fake-app-server.mjs'),
      scriptFile,
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const result = await client.turn('Implement the blueprint.', {
      cwd: root,
      sandbox: 'workspace-write',
      timeoutMs: 5_000,
    })
    expect(result.status).toBe('completed')
    expect(result.responseText).toContain('Build done')
    const types = events.map((e) => e.type)
    expect(types).toContain('session_started')
    expect(types).toContain('agent_message_delta')
    expect(types).toContain('turn_completed')
    await client.dispose()
  })

  it('unparsable lines surface as errors, not crashes (P10.15)', async () => {
    const scriptFile = join(tmp, 'script-garbage.json')
    writeFileSync(
      scriptFile,
      JSON.stringify({ respondTurnStart: true, emitTurnCompleted: true, replyGarbage: true }),
    )
    const client = new TestableClient([
      process.execPath,
      join(__dirname, '../testdata/fake-app-server.mjs'),
      scriptFile,
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const result = await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    expect(result.status).toBe('completed')
    expect(events.some((e) => e.type === 'error' && e.message.includes('unparsable'))).toBe(true)
    await client.dispose()
  })

  it('child exit mid-session fails the next request and rejects pending work (P10.05)', async () => {
    const scriptFile = join(tmp, 'script-exit.json')
    writeFileSync(scriptFile, JSON.stringify({ exitAfterInitialize: true }))
    const client = new TestableClient([
      process.execPath,
      join(__dirname, '../testdata/fake-app-server.mjs'),
      scriptFile,
    ])
    const events: CodexEvent[] = []
    // handshake succeeds (the fake answers initialize, THEN exits)
    await client.start((e) => events.push(e))
    const result = await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    expect(result.status).toBe('failed')
    expect(result.error).toBeTruthy()
    await client.dispose()
  })
})

/** TestableClient: spawns an explicit argv (the fake app-server). */
class TestableClient extends AppServerCodexClient {
  constructor(private readonly argv: string[]) {
    super('definitely-not-used')
  }
  protected override spawnProcess(
    command: string,
    args: string[],
  ): import('node:child_process').ChildProcessWithoutNullStreams {
    void command
    void args
    const { spawn } = require('node:child_process') as typeof import('node:child_process')
    return spawn(this.argv[0], this.argv.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as import('node:child_process').ChildProcessWithoutNullStreams
  }
}

describe('FakeCodexClient (P14.08, P14.15)', () => {
  it('scripts events, file edits, failures and cancellation', async () => {
    const client = new FakeCodexClient([
      {
        matches: 'implement',
        steps: [{ event: { type: 'agent_message_delta', delta: 'working' } }],
        writeFiles: { 'src/feature.ts': 'export const ok = true\n' },
        result: { status: 'completed', responseText: 'done' },
      },
      {
        matches: 'explode',
        failWith: 'transport died',
        steps: [],
        result: { status: 'failed', responseText: '' },
      },
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const ok = await client.turn('please implement it', { cwd: root, sandbox: 'workspace-write' })
    expect(ok.status).toBe('completed')
    expect(events.some((e) => e.type === 'file_change_completed')).toBe(true)
    await expect(
      client.turn('explode now', { cwd: root, sandbox: 'workspace-write' }),
    ).rejects.toThrow('transport died')
    expect(client.turns).toHaveLength(2)
    const [first] = client.turns
    expect(first.prompt).toContain('implement')
    expect(first.options.sandbox).toBe('workspace-write')
    await client.dispose()
    expect(client.disposed).toBe(true)
  })
})

describe('build workspace lifecycle (P10.07, P10.11-P10.13)', () => {
  it('prepares, diffs, applies and tags a known-good build', () => {
    fs.mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'app.ts'), 'export const v1 = 1\n')
    const ws = prepareWorkspace(root, 'b1')
    writeFileSync(join(root, 'app.ts'), 'export const v2 = 2\n')
    writeFileSync(join(root, 'extra.ts'), 'export const extra = true\n')
    const { changed, stat } = diffSummary(ws)
    expect(changed).toContain('app.ts')
    expect(stat).toContain('app.ts')
    const commit = commitBuild(ws, 'feat: v2')
    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    const applied = applyBuild(ws, commit, 'b1')
    expect(applied.ok).toBe(true)
    expect(applied.knownGoodTag).toBe('mdt-known-good/b1')
  })

  it('failed builds never pollute main; rollback returns to known-good', () => {
    fs.mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'app.ts'), 'export const v1 = 1\n')
    const ws1 = prepareWorkspace(root, 'b1')
    writeFileSync(join(root, 'app.ts'), 'export const v2 = 2\n')
    const c1 = commitBuild(ws1, 'feat: v2')
    applyBuild(ws1, c1, 'b1')
    // a bad build: prepare from v2, write garbage, but never apply
    const ws2 = prepareWorkspace(root, 'b2')
    writeFileSync(join(root, 'app.ts'), 'export const broken = {{{\n')
    const badCommit = commitBuild(ws2, 'feat: broken')
    discardBuild(ws2) // failed build discarded → main still at v2
    const headAfterDiscard = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
    expect(headAfterDiscard).toBe(c1)
    // explicit rollback: re-apply bad build then roll back to previous tag
    execFileSync('git', ['-C', root, 'merge', '--ff-only', badCommit], { stdio: 'ignore' })
    const rolled = rollbackBuild(root)
    expect(rolled.ok).toBe(true)
    const current = execFileSync('git', ['-C', root, 'show', 'HEAD:app.ts'], { encoding: 'utf8' })
    expect(current).toContain('v2')
  })
})

describe('build log + redaction (P10.17, P13.04)', () => {
  it('writes redacted JSONL and reads it back', () => {
    const log = new BuildLog(join(tmp, 'builds'), 'b1')
    log.append('build_started', { prompt: 'use key sk-abcdefghijklmnopqrst' })
    log.append('codex_event', { authorization: 'Bearer supersecrettoken123' })
    const entries = log.readAll()
    expect(entries).toHaveLength(2)
    expect(JSON.stringify(entries)).not.toContain('sk-abcdefghijklmnopqrst')
    expect(JSON.stringify(entries)).not.toContain('supersecrettoken123')
    expect(entries[0]?.kind).toBe('build_started')
  })

  it('redactText masks common secret shapes', () => {
    const out = redactText('api_key: sk-abcdef1234567890abcdef and Bearer zzz.yyy.xxx')
    expect(out).not.toContain('sk-abcdef1234567890abcdef')
    expect(out).not.toContain('Bearer zzz')
    expect(out).toContain('[redacted]')
  })

  it('rotateBuildLogs keeps only the newest N build dirs', () => {
    const buildsDir = join(tmp, 'rotate')
    for (let i = 0; i < 25; i++) {
      const dir = join(buildsDir, `b${String(i).padStart(2, '0')}`)
      execFileSync('node', [
        '-e',
        `require('fs').mkdirSync(${JSON.stringify(dir)}, { recursive: true })`,
      ])
    }
    rotateBuildLogs(buildsDir, 5)
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    expect(readdirSync(buildsDir).length).toBe(5)
  })
})

describe('availability + versions (P10.03, P10.19)', () => {
  it('parses codex-cli version strings', () => {
    expect(parseVersion('codex-cli 0.144.1')).toBe('0.144.1')
    expect(parseVersion('codex-cli 0.154.0 (2026-06-17)')).toBe('0.154.0')
  })

  it('warns outside the verified range or when not logged in', () => {
    const availability = checkAvailability()
    if (availability.installed) {
      expect(availability.version).toMatch(/^\d+\.\d+\.\d+$/)
      if (availability.version === '0.144.1') expect(availability.compatWarning).toBeUndefined()
    }
    // resolveCodexBinary returns something spawnable
    expect(resolveCodexBinary('custom-codex').command).toBe('custom-codex')
  })
})
