import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FakeCodexClient } from '../src/fake'
import type { CodexEvent } from '../src/types'

let tmp: string
let root: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-codex-fake-'))
  root = join(tmp, 'generated')
  mkdirSync(root, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('FakeCodexClient remaining branches (P14.08, P14.15)', () => {
  it('an empty script list produces a descriptive error instead of a crash', async () => {
    const client = new FakeCodexClient([])
    await client.start(() => {})
    await expect(client.turn('anything at all', { cwd: root })).rejects.toThrow(
      /no script for prompt/,
    )
  })
})

describe('FakeCodexClient scripted routing (P14.08)', () => {
  it('routes matched prompts, appended scripts and unmatched fallback correctly', async () => {
    const client = new FakeCodexClient([
      {
        matches: 'first task',
        steps: [{ event: { type: 'agent_message_delta', delta: 'doing' } }],
        result: { status: 'completed', responseText: 'one' },
      },
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    // repair loop decided at test time:
    client.addScript({
      matches: 'repair',
      steps: [{ event: { type: 'agent_message_delta', delta: 'fixing' } }],
      result: { status: 'completed', responseText: 'two' },
    })
    const first = await client.turn('run the first task', { cwd: root })
    expect(first.responseText).toBe('one')
    const second = await client.turn('now repair it', { cwd: root })
    expect(second.responseText).toBe('two')
    // a prompt matching NO script falls back to the last script in the list
    const fallback = await client.turn('utterly unrelated prompt', { cwd: root })
    expect(fallback.responseText).toBe('two')
    expect(client.turns).toHaveLength(3)
    const deltas = events
      .filter((e) => e.type === 'agent_message_delta')
      .map((e) => (e as { delta: string }).delta)
    expect(deltas.join('|')).toBe('doing|fixing|fixing')
  })

  it('delayMs steps honor options.signal abort — the turn rejects (P08.12)', async () => {
    const controller = new AbortController()
    const client = new FakeCodexClient([
      {
        steps: [{ delayMs: 10_000, event: { type: 'agent_message_delta', delta: 'never' } }],
        result: { status: 'completed', responseText: 'never' },
      },
    ])
    await client.start(() => {})
    const turnPromise = client.turn('go', { cwd: root, signal: controller.signal })
    await sleep(30)
    controller.abort()
    await expect(turnPromise).rejects.toThrow(/abort/i)
  })

  it('interrupt() during a delayed step stops the script and reports interrupted', async () => {
    const client = new FakeCodexClient([
      {
        steps: [
          { delayMs: 60, event: { type: 'agent_message_delta', delta: 'a' } },
          { delayMs: 60, event: { type: 'agent_message_delta', delta: 'b' } },
          { delayMs: 60, event: { type: 'agent_message_delta', delta: 'c' } },
        ],
        result: { status: 'completed', responseText: 'never reached' },
      },
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const turnPromise = client.turn('go', { cwd: root })
    await sleep(20) // inside the first delayed step
    await client.interrupt()
    const result = await turnPromise
    expect(result.status).toBe('interrupted')
    expect(result.responseText).toBe('')
    expect(events.some((e) => e.type === 'turn_completed' && e.status === 'interrupted')).toBe(true)
  })

  it('applies writeFiles + deleteFiles together; delete-only scripts emit an empty file list', async () => {
    writeFileSync(join(root, 'old.txt'), 'stale')
    const client = new FakeCodexClient([
      {
        steps: [],
        writeFiles: { 'src/new.ts': 'export const fresh = true\n' },
        deleteFiles: ['old.txt'],
        result: { status: 'completed', responseText: 'edited' },
      },
    ])
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const first = await client.turn('go', { cwd: root })
    expect(first.status).toBe('completed')
    expect(existsSync(join(root, 'src', 'new.ts'))).toBe(true)
    expect(existsSync(join(root, 'old.txt'))).toBe(false)
    expect(events.find((e) => e.type === 'file_change_completed')?.files).toEqual(['src/new.ts'])

    // delete-only script: the writeFiles branch stays empty, files list is []
    const client2 = new FakeCodexClient([
      {
        steps: [],
        deleteFiles: ['src/new.ts'],
        result: { status: 'completed', responseText: 'cleaned' },
      },
    ])
    const events2: CodexEvent[] = []
    await client2.start((e) => events2.push(e))
    await client2.turn('go again', { cwd: root })
    expect(existsSync(join(root, 'src', 'new.ts'))).toBe(false)
    expect(events2.find((e) => e.type === 'file_change_completed')?.files).toEqual([])
  })
})
