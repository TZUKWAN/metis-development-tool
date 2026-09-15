import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CodexEvent } from '../src/types'
import { BrokenSpawnClient, TestableClient, fakeServerArgv, waitForEvent } from './helpers'

let tmp: string
let root: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mdt-codex-as-'))
  root = join(tmp, 'generated')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('AppServerCodexClient protocol branches (P10.02, P10.05, P10.06)', () => {
  it('an initialize error response rejects start() with the server message', async () => {
    const client = new TestableClient(
      fakeServerArgv(tmp, { errorOnInitialize: true, errorMessage: 'boom' }),
    )
    await expect(client.start(() => {})).rejects.toThrow('boom')
    await client.dispose()
  })

  it('an unspawnable binary rejects the handshake instead of crashing (P10.05)', async () => {
    const client = new BrokenSpawnClient()
    await expect(client.start(() => {})).rejects.toThrow(/spawn|ENOENT|exited/i)
    await client.dispose()
  })

  it('stderr output surfaces as error events without killing the session', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, { stderrPing: 'ready' }))
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    expect(
      events.some((e) => e.type === 'error' && e.message.includes('codex stderr: ready')),
    ).toBe(true)
    const result = await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    expect(result.status).toBe('completed')
    await client.dispose()
  })

  it('maps stray protocol notifications onto CodexEvents, coercing non-strings (P10.06)', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, { strayEvents: true }))
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const result = await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    expect(result.status).toBe('completed')
    // numeric deltas/ids go through the str() coercion
    expect(events.find((e) => e.type === 'command_output')?.text).toBe('42')
    expect(events.some((e) => e.type === 'session_started')).toBe(true) // numeric thread id
    // turn/diff/updated → file_change_started
    expect(events.some((e) => e.type === 'file_change_started')).toBe(true)
    // command execution items → started + completed with exit code
    expect(events.find((e) => e.type === 'command_started')?.command).toBe('npm test')
    expect(events.find((e) => e.type === 'command_completed')?.exitCode).toBe(0)
    // completed fileChange items map to file lists; empty paths are filtered
    const files = events.find((e) => e.type === 'file_change_completed')
    expect(files?.files).toEqual(['src/a.ts'])
    // the "error" protocol method surfaces as an error event
    expect(events.some((e) => e.type === 'error' && e.message === 'mid-turn warning')).toBe(true)
    await client.dispose()
  })

  it('a failed turn surfaces the server error text (P10.06)', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, { turnFailed: true }))
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const result = await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('gate failed')
    const completed = events.find((e) => e.type === 'turn_completed')
    expect(completed?.status).toBe('failed')
    expect(events.some((e) => e.type === 'error' && e.message === 'gate failed')).toBe(true)
    await client.dispose()
  })

  it('aborting mid-turn interrupts the turn and kills the session (P10.14)', async () => {
    const controller = new AbortController()
    const client = new TestableClient(fakeServerArgv(tmp, { holdUntilInterrupt: true }))
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const turnPromise = client.turn('go', {
      cwd: root,
      timeoutMs: 5_000,
      signal: controller.signal,
    })
    // the fake pings stderr when turn/started is out — abort only then
    await waitForEvent(events, (e) => e.type === 'error' && e.message.includes('turn-started'))
    controller.abort()
    const result = await turnPromise
    expect(result.status).toBe('interrupted')
    expect(result.error).toBe('turn was interrupted')
    // the interrupt killed the child; further disposals are no-ops
    await client.dispose()
    await client.dispose()
  })

  it('a child exiting right after turn/started fails the turn within seconds (P10.05)', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, { exitAfterTurnStarted: true }))
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const began = Date.now()
    const result = await client.turn('go', { cwd: root, timeoutMs: 10_000 })
    // the exit must reject the pending request — NOT wait out the 10s timeout
    expect(Date.now() - began).toBeLessThan(5_000)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('exited with code 7')
    await client.dispose()
  })

  it('runTurn rejects when no thread id was ever learned (defensive guard)', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, {}))
    await client.start(() => {})
    // a missing id in the thread/start reply is coerced to '' upstream, so
    // this guard is only reachable when threadId was never assigned at all
    const internals = client as unknown as {
      runTurn: (prompt: string, options: object) => Promise<unknown>
    }
    await expect(internals.runTurn('go', {})).rejects.toThrow(
      'thread/start did not return a thread id',
    )
    await client.dispose()
  })

  it('a stdin write failure rejects the pending request (broken pipe)', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, {}))
    await client.start(() => {})
    // simulate a dead transport at the boundary: the write callback errors.
    // The failure happens on thread/start, so turn() itself rejects.
    const broken = client as unknown as {
      child: {
        stdin: { write: (line: string, cb: (err: Error) => void) => void; destroy: () => void }
      }
    }
    broken.child.stdin = {
      write: (_line: string, cb: (err: Error) => void) => cb(new Error('EPIPE: simulated')),
      destroy: () => {}, // child exit cleanup calls stdin.destroy()
    }
    await expect(client.turn('go', { cwd: root, timeoutMs: 5_000 })).rejects.toThrow(
      'codex app-server stdin closed (EPIPE: simulated)',
    )
    await client.dispose()
  })

  it('ignores replies to unknown ids, blank lines and non-request JSON (P10.15)', async () => {
    const client = new TestableClient(
      fakeServerArgv(tmp, { unknownIdResponse: true, jsonScalar: true, blankLines: true }),
    )
    const events: CodexEvent[] = []
    await client.start((e) => events.push(e))
    const result = await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    expect(result.status).toBe('completed')
    expect(result.responseText).toBe('Build done. ')
    expect(events.some((e) => e.type === 'error' && e.message.includes('unparsable'))).toBe(false)
    await client.dispose()
  })

  it('a dangling request is rejected by the 30s request timeout', async () => {
    vi.useFakeTimers()
    try {
      // the fake answers initialize, then never answers anything again —
      // without fake timers this scenario would need a 30s wall-clock wait
      const client = new TestableClient(fakeServerArgv(tmp, { dangleAllRequests: true }))
      await client.start(() => {})
      const turnPromise = client.turn('go', { cwd: root })
      // attach the outcome handler immediately so the rejection is always handled
      const outcome = turnPromise.then(
        () => 'resolved' as const,
        () => 'rejected' as const,
      )
      await vi.advanceTimersByTimeAsync(30_100)
      expect(await outcome).toBe('rejected')
      vi.useRealTimers()
      await client.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('turn() before start() throws; dispose is idempotent and safe pre-start (P10.05)', async () => {
    const neverStarted = new TestableClient(fakeServerArgv(tmp, {}))
    await expect(neverStarted.turn('go', { cwd: root })).rejects.toThrow(
      'CodexClient.start() must be called before turn()',
    )
    await expect(neverStarted.dispose()).resolves.toBeUndefined()
    // interrupt before any turn is a no-op (no thread/turn ids yet)
    const client = new TestableClient(fakeServerArgv(tmp, {}))
    await client.start(() => {})
    await expect(client.interrupt()).resolves.toBeUndefined()
    await client.dispose()
    await expect(client.dispose()).resolves.toBeUndefined()
  })

  it('interrupt after dispose hits the not-running path and is swallowed', async () => {
    const client = new TestableClient(fakeServerArgv(tmp, {}))
    await client.start(() => {})
    await client.turn('go', { cwd: root, timeoutMs: 5_000 })
    await client.dispose()
    await expect(client.interrupt()).resolves.toBeUndefined()
  })

  it('the default spawnProcess transport yields usable stdio pipes', async () => {
    const client = new TestableClient([])
    const child = client.spawnReal()
    expect(typeof child.pid).toBe('number')
    expect(child.stdin.writable).toBe(true)
    child.kill()
    await new Promise<void>((resolve) => child.on('exit', () => resolve()))
  })
})
