/**
 * Shared test helpers for app-server protocol tests: a TestableClient that
 * spawns an explicit argv (the fake app-server child), a script writer for
 * the fake, and event polling.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { AppServerCodexClient } from '../src/app-server'
import type { CodexEvent } from '../src/types'

export const FAKE_SERVER_PATH = join(__dirname, '../testdata/fake-app-server.mjs')

/** Serialize a script object for the fake app-server and return its argv. */
export function fakeServerArgv(tmpDir: string, script: Record<string, unknown>): string[] {
  const file = join(tmpDir, `script-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(file, JSON.stringify(script))
  return [process.execPath, FAKE_SERVER_PATH, file]
}

/** TestableClient: spawns an explicit argv (the fake app-server). */
export class TestableClient extends AppServerCodexClient {
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
  /**
   * Reach the REAL spawnProcess implementation (tests override it everywhere
   * else): spawns node with a harmless script that waits on stdin.
   */
  spawnReal(): import('node:child_process').ChildProcessWithoutNullStreams {
    return super.spawnProcess(process.execPath, ['-e', 'process.stdin.resume()'])
  }
}

/** A client whose spawn target never exists — exercises the spawn-error path. */
export class BrokenSpawnClient extends AppServerCodexClient {
  protected override spawnProcess(): import('node:child_process').ChildProcessWithoutNullStreams {
    const { spawn } = require('node:child_process') as typeof import('node:child_process')
    return spawn('definitely-missing-codex-binary-xyz', ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as import('node:child_process').ChildProcessWithoutNullStreams
  }
}

/** Poll `events` until a matching event arrives (or throw after timeoutMs). */
export async function waitForEvent(
  events: CodexEvent[],
  predicate: (event: CodexEvent) => boolean,
  timeoutMs = 3_000,
): Promise<CodexEvent> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = events.find(predicate)
    if (found) return found
    if (Date.now() > deadline) throw new Error('timed out waiting for expected codex event')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
