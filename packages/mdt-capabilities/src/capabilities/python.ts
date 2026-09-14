/**
 * `python` capability (tasklist P13.08-adjacent): run a Python script in
 * isolated mode. The script is piped via STDIN (never `-c`, never a temp
 * file next to user code), extra args become sys.argv. The interpreter is
 * probed once ('python' then 'python3') and cached; when none exists the
 * capability reports a structured unavailable error instead of crashing.
 * Default permission state is DENIED (explicit process grant required).
 */
import { spawn, spawnSync } from 'node:child_process'

import { requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { resolveInSandbox } from '../security/paths'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OUTPUT_BYTES = 200_000

const UNAVAILABLE_MESSAGE =
  'python capability unavailable: no python interpreter found on this machine'

let cachedInterpreter: string | null | undefined

/** Probe 'python' then 'python3' once via `--version`; cache the result. */
export function resolvePythonInterpreter(): string | null {
  if (cachedInterpreter !== undefined) return cachedInterpreter
  for (const candidate of ['python', 'python3']) {
    try {
      const probe = spawnSync(candidate, ['--version'], {
        shell: false,
        timeout: 10_000,
        windowsHide: true,
      })
      if (!probe.error && probe.status === 0) {
        cachedInterpreter = candidate
        return candidate
      }
    } catch {
      // try the next candidate
    }
  }
  cachedInterpreter = null
  return null
}

/** Test helper: reset the cached interpreter probe. */
export function resetPythonInterpreterCache(): void {
  cachedInterpreter = undefined
}

export const pythonCapability: Capability = {
  manifest: {
    id: 'python',
    name: 'Python',
    version: '1.0.0',
    category: 'process',
    description:
      'Run a Python script (isolated mode, script via stdin, extra args as sys.argv). Requires an explicit process permission grant.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'python source, piped to the interpreter via stdin',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'passed after "-" as sys.argv (default [])',
        },
        timeoutMs: { type: 'number', description: 'default 20000, max 60000' },
        maxOutputBytes: {
          type: 'number',
          description: 'combined stdout+stderr cap (default 200000)',
        },
      },
      required: ['script'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        exitCode: { type: 'number' },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        truncated: { type: 'boolean' },
      },
      required: ['exitCode', 'stdout', 'stderr', 'truncated'],
      additionalProperties: false,
    },
    permissions: [
      {
        scope: 'process',
        detail: 'run a python script in the generated workspace',
        required: true,
        defaultGranted: false,
      },
    ],
    secrets: [],
    ui: {
      icon: '🐍',
      accent: '#5b8def',
      summary: 'Run a sandboxed Python script (isolated mode)',
      keywords: ['python', 'script', 'process'],
      doc: 'python',
    },
    timeoutMs: 60_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(
    input: Record<string, unknown>,
    ctx: CapabilityContext,
  ): Promise<Record<string, unknown>> {
    requirePermission(ctx, pythonCapability, 'process')
    if (!Array.isArray(ctx.sandboxRoots) || ctx.sandboxRoots.length === 0) {
      throw new Error('python capability requires an explicit sandbox root')
    }
    if (ctx.signal.aborted) throw new Error('python cancelled')

    const interpreter = resolvePythonInterpreter()
    if (!interpreter) throw new Error(UNAVAILABLE_MESSAGE)

    const script = typeof input.script === 'string' && input.script !== '' ? input.script : null
    if (!script) throw new Error('python: "script" is required and must be a non-empty string')
    const args = Array.isArray(input.args) ? input.args.map(String) : []
    const cwd = resolveInSandbox({ roots: ctx.sandboxRoots, workdir: ctx.workdir }, '.')
    const timeoutMs = normalizeInt(
      input.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      'python: timeoutMs',
    )
    const maxOutputBytes = normalizeInt(
      input.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
      10_000_000,
      'python: maxOutputBytes',
    )

    const env: Record<string, string> = {}
    for (const name of ctx.envAllowlist) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }

    const controller = new AbortController()
    const state = { timedOut: false, cancelled: false }
    const onAbort = () => {
      state.cancelled = true
      controller.abort()
    }
    if (ctx.signal.aborted) {
      state.cancelled = true
      controller.abort()
    } else {
      ctx.signal.addEventListener('abort', onAbort, { once: true })
    }
    const timer = setTimeout(() => {
      state.timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      // -I: isolated mode; "-": read the script from stdin; args become sys.argv[1:]
      const child = spawn(interpreter, ['-I', '-', ...args], {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        signal: controller.signal,
      })
      if (!child.stdout || !child.stderr || !child.stdin)
        throw new Error('python: failed to open stdio pipes for the interpreter')

      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let collected = 0
      let truncated = false
      const cap = (chunk: Buffer, sink: Buffer[]): void => {
        collected += chunk.byteLength
        if (collected > maxOutputBytes) {
          truncated = true
          child.kill()
          return
        }
        sink.push(chunk)
      }
      child.stdout.on('data', (chunk: Buffer) => cap(chunk, stdout))
      child.stderr.on('data', (chunk: Buffer) => cap(chunk, stderr))
      // the interpreter may exit early (syntax error) — swallow EPIPE on stdin
      child.stdin.on('error', () => {})

      const exit = await new Promise<{ code: number | null; signal: string | null; error?: Error }>(
        (resolve) => {
          let settled = false
          child.on('error', (err) => {
            if (!settled) {
              settled = true
              resolve({ code: null, signal: null, error: err })
            }
          })
          child.on('close', (code, signal) => {
            if (!settled) {
              settled = true
              resolve({ code, signal })
            }
          })
          child.stdin.end(script, 'utf8')
        },
      )
      if (state.timedOut)
        throw new Error(`python: script timed out after ${timeoutMs}ms and was killed`)
      if (state.cancelled) throw new Error('python cancelled')
      if (exit.error)
        throw new Error(`python: failed to start "${interpreter}": ${exit.error.message}`)

      ctx.log(
        `python script (${script.length} chars, ${args.length} args) -> exit=${exit.code ?? 'killed'}${truncated ? ' (truncated)' : ''}`,
      )
      return {
        exitCode: exit.code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        truncated,
      }
    } finally {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', onAbort)
    }
  },
}

function normalizeInt(value: unknown, fallback: number, max: number, label: string): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`)
  if (n > max) throw new Error(`${label} must be ≤ ${max}`)
  return n
}
