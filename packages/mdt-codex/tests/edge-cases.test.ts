import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FakeCodexClient } from '../src/fake'
import { resolveCodexBinary, checkAvailability } from '../src/versions'
import type { CodexEvent } from '../src/types'

describe('codex client edge branches (P10.05, P10.14, P10.15)', () => {
  const root = mkdtempSync(join(tmpdir(), 'mdt-codex-edge-'))

  it('interrupt before any turn is a safe no-op; turn still works afterwards', async () => {
    const client = new FakeCodexClient([
      { steps: [], result: { status: 'completed', responseText: 'ok' } },
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    await client.interrupt() // no active turn — must not throw
    const result = await client.turn('go', { cwd: root, sandbox: 'read-only' })
    expect(result.status).toBe('completed')
  })

  it('turn options are recorded verbatim for audit (timeout + sandbox)', async () => {
    const client = new FakeCodexClient([
      { steps: [], result: { status: 'completed', responseText: '' } },
    ])
    await client.start(() => {})
    await client.turn('t1', {
      cwd: root,
      sandbox: 'workspace-write',
      networkAccess: true,
      timeoutMs: 1_234,
    })
    const [recorded] = client.turns
    expect(recorded.options).toMatchObject({
      sandbox: 'workspace-write',
      networkAccess: true,
      timeoutMs: 1_234,
    })
  })

  it('a failing scripted step still reaches onEvent listeners before result', async () => {
    const client = new FakeCodexClient([
      {
        steps: [
          { event: { type: 'command_started', command: 'npm test' } },
          { event: { type: 'error', message: 'gate failed' } },
        ],
        result: { status: 'completed', responseText: 'repaired' },
      },
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const result = await client.turn('repair the gates', { cwd: root })
    expect(result.responseText).toBe('repaired')
    expect(events.map((e) => e.type)).toEqual(['command_started', 'error'])
  })

  it('availability check returns a structured state on this machine', () => {
    const availability = checkAvailability()
    if (availability.installed) {
      expect(availability.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(typeof availability.loggedIn).toBe('boolean')
    } else {
      expect(availability.compatWarning).toContain('npm install -g @openai/codex')
    }
    expect(resolveCodexBinary('codex-test').command).toBe('codex-test')
  })
})
