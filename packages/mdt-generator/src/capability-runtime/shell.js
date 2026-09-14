/**
 * Self-contained `shell` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/shell.js).
 * Plain JS, zero npm dependencies. Port of @mdt/capabilities shell.ts:
 * defense against command injection — the command is NEVER passed through a
 * shell (`spawn(command, args, { shell: false })`, args verbatim), the
 * environment is restricted to the context allowlist, cwd must resolve
 * inside an explicit sandbox root, the child is killed on timeout/cancel
 * and output is capped with a `truncated` flag. Default permission state is
 * DENIED (explicit process grant required).
 */
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 200_000

// ---------------------------------------------------------------------------
// sandbox guard (port of security/paths.ts resolveInSandbox)
// ---------------------------------------------------------------------------

export class PathEscapeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PathEscapeError'
    this.code = 'PATH_ESCAPE'
  }
}

function canonical(p) {
  try {
    return realpathSync(p)
  } catch {
    // target does not exist yet: canonicalize the deepest existing ancestor
    // and append the remainder
    const abs = path.resolve(p)
    let parent = path.dirname(abs)
    while (parent !== abs) {
      try {
        return path.join(realpathSync(parent), path.relative(parent, abs))
      } catch {
        const next = path.dirname(parent)
        if (next === parent) break
        parent = next
      }
    }
    return path.resolve(abs)
  }
}

/**
 * Resolve `userPath` inside the sandbox. `workdir` applies when the path is
 * relative. Throws PathEscapeError on escape. Returns the canonical absolute
 * path that all IO must use.
 */
export function resolveInSandbox(sandbox, userPath) {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new PathEscapeError('path must be a non-empty string')
  }
  if (userPath.includes('\0')) {
    throw new PathEscapeError('path contains NUL byte')
  }
  const base = path.isAbsolute(userPath)
    ? userPath
    : path.join(sandbox.workdir ?? sandbox.roots[0] ?? process.cwd(), userPath)
  const resolved = canonical(base)
  for (const root of sandbox.roots) {
    const rootCanonical = canonical(root)
    const rel = path.relative(rootCanonical, resolved)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return resolved
    }
  }
  throw new PathEscapeError(`path "${userPath}" escapes the sandbox roots`)
}

// ---------------------------------------------------------------------------
// shared guards
// ---------------------------------------------------------------------------

/** Permission gate: denied scopes throw a typed error (P13.06). */
export function requirePermission(ctx, capabilityId, scope) {
  if (!ctx.granted.has(scope)) {
    const error = new Error(
      `capability "${capabilityId}" requires ${scope} permission, which is not granted in this project`,
    )
    error.name = 'PermissionDeniedError'
    error.code = 'PERMISSION_DENIED'
    throw error
  }
}

function normalizeInt(value, fallback, max, label) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`)
  if (n > max) throw new Error(`${label} must be ≤ ${max}`)
  return n
}

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

export async function execute(input, ctx) {
  requirePermission(ctx, 'shell', 'process')
  if (!Array.isArray(ctx.sandboxRoots) || ctx.sandboxRoots.length === 0) {
    throw new Error('shell capability requires an explicit sandbox root')
  }
  if (ctx.signal.aborted) throw new Error('shell cancelled')

  const command =
    typeof input.command === 'string' && input.command.trim() !== '' ? input.command.trim() : null
  if (!command) throw new Error('shell: "command" is required and must be a non-empty string')
  const args = Array.isArray(input.args) ? input.args.map(String) : []
  const cwd = resolveInSandbox(
    { roots: ctx.sandboxRoots, workdir: ctx.workdir },
    typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : '.',
  )
  const timeoutMs = normalizeInt(
    input.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
    'shell: timeoutMs',
  )
  const maxOutputBytes = normalizeInt(
    input.maxOutputBytes,
    DEFAULT_MAX_OUTPUT_BYTES,
    10_000_000,
    'shell: maxOutputBytes',
  )

  // only allowlisted env entries leak into the child — nothing else
  const env = {}
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
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      signal: controller.signal,
    })
    if (!child.stdout || !child.stderr)
      throw new Error('shell: failed to open stdio pipes for the child process')

    const stdout = []
    const stderr = []
    let collected = 0
    let truncated = false
    const cap = (chunk, sink) => {
      collected += chunk.byteLength
      if (collected > maxOutputBytes) {
        truncated = true
        child.kill()
        return
      }
      sink.push(chunk)
    }
    child.stdout.on('data', (chunk) => cap(chunk, stdout))
    child.stderr.on('data', (chunk) => cap(chunk, stderr))

    const exit = await new Promise((resolve) => {
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
    if (state.timedOut)
      throw new Error(`shell: command timed out after ${timeoutMs}ms and was killed`)
    if (state.cancelled) throw new Error('shell cancelled')
    if (exit.error) {
      // spawn failure (ENOENT & co): structured error, never a hang
      throw new Error(`shell: failed to start "${command}": ${exit.error.message}`)
    }

    const stdoutText = Buffer.concat(stdout).toString('utf8')
    const stderrText = Buffer.concat(stderr).toString('utf8')
    ctx.log(
      `shell ${command} (${args.length} args) -> exit=${exit.code ?? 'killed'}${truncated ? ' (truncated)' : ''}`,
    )
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
}
