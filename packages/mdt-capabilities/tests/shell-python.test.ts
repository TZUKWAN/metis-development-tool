/**
 * shell + python capability tests: permission gating (denied by default),
 * sandbox-root requirement, no shell interpolation, env allowlist, timeout
 * kill, output caps. Python cases degrade gracefully when no interpreter
 * is installed.
 */
import { existsSync } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { createCapabilityContext, PermissionDeniedError, type ContextOverrides } from '../src/context'
import { pythonCapability, resolvePythonInterpreter } from '../src/capabilities/python'
import { shellCapability } from '../src/capabilities/shell'
import { runCapabilityContractTests } from '../src/testing'
import { makeTempDir, removeTempDir } from './helpers'

const root = await makeTempDir('mdt-cap-shell-')
afterAll(async () => {
  await removeTempDir(root)
})

const overrides: ContextOverrides = { granted: ['process'], sandboxRoots: [root], workdir: root, envAllowlist: ['PATH'] }

runCapabilityContractTests(
  shellCapability,
  overrides,
  { happyInput: { command: 'node', args: ['-e', 'console.log(42)'] }, invalidInput: { command: '' } },
)

describe('shell permission gating', () => {
  it('denies the default context (process is never default-granted)', async () => {
    const ctx = createCapabilityContext({ sandboxRoots: [root], workdir: root })
    await expect(shellCapability.execute({ command: 'node', args: ['-e', 'console.log(1)'] }, ctx)).rejects.toThrow(
      PermissionDeniedError,
    )
  })

  it('refuses to run without an explicit sandbox root', async () => {
    const ctx = createCapabilityContext({ granted: ['process'], sandboxRoots: [], workdir: root })
    await expect(shellCapability.execute({ command: 'node' }, ctx)).rejects.toThrow(
      'shell capability requires an explicit sandbox root',
    )
  })
})

describe('shell behavior (granted)', () => {
  const ctx = createCapabilityContext(overrides)

  it('runs a command with args (never through a shell)', async () => {
    const out = await shellCapability.execute({ command: 'node', args: ['-e', 'console.log(1)'] }, ctx)
    expect(out.exitCode).toBe(0)
    expect(String(out.stdout).trim()).toBe('1')
    expect(out.truncated).toBe(false)
  }, 15_000)

  it('does not interpret shell metacharacters in args', async () => {
    const out = await shellCapability.execute(
      {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', 'a & whoami', 'b | c', 'd; e'],
      },
      ctx,
    )
    expect(out.exitCode).toBe(0)
    expect(JSON.parse(String(out.stdout))).toEqual(['a & whoami', 'b | c', 'd; e'])
  }, 15_000)

  it('only exposes allowlisted env vars to the child', async () => {
    process.env.MDT_SHELL_MARKER = 'marker-secret-value'
    try {
      const out = await shellCapability.execute(
        { command: 'node', args: ['-e', 'console.log(Object.keys(process.env).join(","))'] },
        createCapabilityContext({ ...overrides, envAllowlist: ['PATH'] }),
      )
      expect(out.exitCode).toBe(0)
      expect(String(out.stdout)).not.toContain('MDT_SHELL_MARKER')
      expect(String(out.stdout)).not.toContain('marker-secret-value')
      expect(String(out.stdout)).toContain('PATH')
    } finally {
      delete process.env.MDT_SHELL_MARKER
    }
  }, 15_000)

  it('kills the child on timeout and reports a structured error', async () => {
    await expect(
      shellCapability.execute({ command: 'node', args: ['-e', 'setTimeout(() => {}, 30000)'], timeoutMs: 800 }, ctx),
    ).rejects.toThrow(/timed out after 800ms and was killed/)
  }, 15_000)

  it('caps output and flags truncation', async () => {
    const out = await shellCapability.execute(
      { command: 'node', args: ['-e', 'process.stdout.write("x".repeat(500000))'], maxOutputBytes: 10_000 },
      ctx,
    )
    expect(out.truncated).toBe(true)
    expect(String(out.stdout).length).toBeLessThan(20_000)
  }, 15_000)

  it('maps spawn failures onto structured errors (no hang)', async () => {
    await expect(shellCapability.execute({ command: 'definitely-not-a-real-cmd-xyz' }, ctx)).rejects.toThrow(
      /failed to start "definitely-not-a-real-cmd-xyz"/,
    )
  }, 15_000)

  it('resolves cwd inside the sandbox', async () => {
    await fsp.mkdir(path.join(root, 'cwd-target'), { recursive: true })
    const out = await shellCapability.execute(
      { command: 'node', args: ['-e', 'process.stdout.write(process.cwd())'], cwd: 'cwd-target' },
      ctx,
    )
    expect(String(out.stdout).toLowerCase()).toBe(path.join(root, 'cwd-target').toLowerCase())
  }, 15_000)

  it('rejects a cwd outside the sandbox', async () => {
    await expect(shellCapability.execute({ command: 'node', cwd: '..' }, ctx)).rejects.toThrow(/escapes the sandbox roots/)
  })

  it('rejects timeoutMs above the 120s cap', async () => {
    await expect(shellCapability.execute({ command: 'node', timeoutMs: 200_000 }, ctx)).rejects.toThrow(/≤ 120000/)
  })

  it('honours pre-aborted signals promptly', async () => {
    const controller = new AbortController()
    controller.abort()
    const ctxAborted = createCapabilityContext({ ...overrides, signal: controller.signal })
    await expect(shellCapability.execute({ command: 'node' }, ctxAborted)).rejects.toThrow(/shell cancelled/)
  })
})

// python is probed once via spawnSync('python'/'python3', ['--version'])
const interpreter = resolvePythonInterpreter()

describe('python capability', () => {
  if (!interpreter) {
    it('reports a structured unavailable error when no interpreter exists', async () => {
      const ctx = createCapabilityContext(overrides)
      await expect(pythonCapability.execute({ script: 'print(1)' }, ctx)).rejects.toThrow(
        'python capability unavailable: no python interpreter found on this machine',
      )
    })
    it.skip('skipped: no python interpreter on this machine', () => {})
  } else {
    const ctx = createCapabilityContext(overrides)

    it('denies the default context', async () => {
      const ctxNoGrant = createCapabilityContext({ sandboxRoots: [root], workdir: root })
      await expect(pythonCapability.execute({ script: 'print(1)' }, ctxNoGrant)).rejects.toThrow(PermissionDeniedError)
    })

    it('refuses to run without an explicit sandbox root', async () => {
      const ctxNoRoots = createCapabilityContext({ granted: ['process'], sandboxRoots: [] })
      await expect(pythonCapability.execute({ script: 'print(1)' }, ctxNoRoots)).rejects.toThrow(/explicit sandbox root/)
    })

    it('runs a script via stdin with sys.argv passthrough', async () => {
      const out = await pythonCapability.execute(
        { script: 'import sys\nprint("args", sys.argv[1:])', args: ['one', 'two'] },
        ctx,
      )
      expect(out.exitCode).toBe(0)
      expect(String(out.stdout).trim()).toBe("args ['one', 'two']")
    }, 20_000)

    it('runs with cwd inside the sandbox', async () => {
      await pythonCapability.execute({ script: "open('py-out.txt', 'w').write('hi')" }, ctx)
      expect(existsSync(path.join(root, 'py-out.txt'))).toBe(true)
    }, 20_000)

    it('reports syntax errors via stderr without crashing', async () => {
      const out = await pythonCapability.execute({ script: 'print(:' }, ctx)
      expect(out.exitCode).not.toBe(0)
      expect(String(out.stderr)).toContain('SyntaxError')
    }, 20_000)

    it('kills long scripts on timeout', async () => {
      await expect(
        pythonCapability.execute({ script: 'import time\ntime.sleep(30)', timeoutMs: 800 }, ctx),
      ).rejects.toThrow(/timed out after 800ms and was killed/)
    }, 20_000)

    runCapabilityContractTests(
      pythonCapability,
      overrides,
      { happyInput: { script: 'print(1+1)' }, invalidInput: { script: '' } },
    )
  }
})
