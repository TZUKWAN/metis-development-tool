/**
 * `shell` capability (tasklist P13.08): run a command in the generated
 * workspace. Defense against command injection: the command is NEVER passed
 * through a shell — `spawn(command, args, { shell: false })` — args are
 * passed verbatim. Environment is restricted to the context allowlist, cwd
 * is sandbox-resolved, and output is capped. Default permission state is
 * DENIED (explicit grant required).
 */
import { spawn } from 'node:child_process'

import { requirePermission } from '../context'
import type { Capability, CapabilityContext } from '../manifest'
import { resolveInSandbox } from '../security/paths'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 200_000

export const shellCapability: Capability = {
  manifest: {
    id: 'shell',
    name: 'Shell',
    version: '1.0.0',
    category: 'process',
    description:
      'Run a command with arguments in the generated workspace (no shell interpolation). Requires an explicit process permission grant.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'executable name or path (spawned WITHOUT a shell)' },
        args: { type: 'array', items: { type: 'string' }, description: 'argument list (default [])' },
        cwd: { type: 'string', description: 'working directory; must resolve inside the sandbox (default workdir)' },
        timeoutMs: { type: 'number', description: 'default 20000, max 120000' },
        maxOutputBytes: { type: 'number', description: 'combined stdout+stderr cap (default 200000)' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        exitCode: { type: 'number' },
        signal: { type: 'string', description: 'termination signal when killed, else empty' },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        truncated: { type: 'boolean' },
      },
      required: ['exitCode', 'stdout', 'stderr', 'truncated'],
      additionalProperties: false,
    },
    permissions: [{ scope: 'process', detail: 'run a command in the generated workspace', required: true, defaultGranted: false }],
    secrets: [],
    ui: {
      icon: '⌨️',
      accent: '#5b8def',
      summary: 'Run a sandboxed shell command (no shell interpolation)',
      keywords: ['shell', 'command', 'process', 'exec'],
      doc: 'shell',
    },
    timeoutMs: 120_000,
    maxOutputBytes: 1_000_000,
  },
  async execute(input: Record<string, unknown>, ctx: CapabilityContext): Promise<Record<string, unknown>> {
    requirePermission(ctx, shellCapability, 'process')
    if (!Array.isArray(ctx.sandboxRoots) || ctx.sandboxRoots.length === 0) {
      throw new Error('shell capability requires an explicit sandbox root')
    }
    if (ctx.signal.aborted) throw new Error('shell cancelled')

    const command = typeof input.command === 'string' && input.command.trim() !== '' ? input.command.trim() : null
    if (!command) throw new Error('shell: "command" is required and must be a non-empty string')
    const args = Array.isArray(input.args) ? input.args.map(String) : []
    const cwd = resolveInSandbox(
      { roots: ctx.sandboxRoots, workdir: ctx.workdir },
      typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : '.',
    )
    const timeoutMs = normalizeInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, 'shell: timeoutMs')
    const maxOutputBytes = normalizeInt(input.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, 10_000_000, 'shell: maxOutputBytes')

    // only allowlisted env entries leak into the child — nothing else
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
      // shell: false is the command-injection defense (P13.08)
      const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, signal: controller.signal })
      if (!child.stdout || !child.stderr) throw new Error('shell: failed to open stdio pipes for the child process')

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

      const exit = await new Promise<{ code: number | null; signal: string | null; error?: Error }>((resolve, reject) => {
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
      })
      if (exit.error) {
        // spawn failure (ENOENT & co): structured error, never a hang
        throw new Error(`shell: failed to start "${command}": ${exit.error.message}`)
      }
      if (state.timedOut) throw new Error(`shell: command timed out after ${timeoutMs}ms and was killed`)
      if (state.cancelled) throw new Error('shell cancelled')

      const stdoutText = Buffer.concat(stdout).toString('utf8')
      const stderrText = Buffer.concat(stderr).toString('utf8')
      ctx.log(`shell ${command} (${args.length} args) -> exit=${exit.code ?? 'killed'}${truncated ? ' (truncated)' : ''}`)
      return {
        exitCode: exit.code ?? -1,
        signal: exit.signal ?? '',
        stdout: stdoutText,
        stderr: stderrText,
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
