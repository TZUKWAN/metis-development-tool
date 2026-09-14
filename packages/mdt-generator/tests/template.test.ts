import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { templateDirFor } from '../src/generator'

const TEMPLATE_DIR = templateDirFor({
  capabilityManifests: new Map(),
  outDir: '.',
})

function npm(
  args: string[],
  cwd: string,
  timeoutMs = 600_000,
): { status: number; stdout: string; stderr: string } {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    // Windows: .cmd shims require a shell (Node EINVAL guard for .bat/.cmd)
    shell: process.platform === 'win32',
  })
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('template suite (templates/web-agent)', () => {
  test('template directory exists with its own package.json', () => {
    expect(existsSync(`${TEMPLATE_DIR}/package.json`)).toBe(true)
    expect(existsSync(`${TEMPLATE_DIR}/server/index.js`)).toBe(true)
  })

  test('template vitest suite passes', () => {
    // install if needed (first run on a fresh checkout)
    if (!existsSync(`${TEMPLATE_DIR}/node_modules`)) {
      const install = npm(['install', '--no-audit', '--no-fund'], TEMPLATE_DIR)
      expect(install.status, install.stderr).toBe(0)
    }
    const run = npm(['run', 'test:unit'], TEMPLATE_DIR)
    if (run.status !== 0) {
      console.error(run.stdout, run.stderr)
    }
    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/passed/i)
  }, 900_000)
})
