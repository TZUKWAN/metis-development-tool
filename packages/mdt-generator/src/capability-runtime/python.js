/**
 * Self-contained `python` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/python.js).
 * Plain JS, zero npm dependencies. Port of @mdt/capabilities python.ts:
 * the script is piped via STDIN in isolated mode (`-I -`, never `-c`, never
 * a temp file next to user code), extra args become sys.argv after `-`. The
 * interpreter is probed once ('python' then 'python3') and cached; when none
 * exists the capability reports a structured unavailable error instead of
 * crashing. Env allowlist / sandbox cwd / timeout kill / output cap
 * discipline matches the shell capability. Default permission state is
 * DENIED (explicit process grant required). Timeout is capped at 60s.
 */
import { spawn, spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OUTPUT_BYTES = 200_000

const UNAVAILABLE_MESSAGE =
  'python capability unavailable: no python interpreter found on this machine'

let cachedInterpreter

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
// interpreter probe
// ---------------------------------------------------------------------------

/** Probe 'python' then 'python3' once via `--version`; cache the result. */
export function resolvePythonInterpreter() {
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
export function resetPythonInterpreterCache() {
  cachedInterpreter = undefined
}

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

export async function execute(input, ctx) {
  requirePermission(ctx, 'python', 'process')
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
    // the interpreter may exit early (syntax error) — swallow EPIPE on stdin
    child.stdin.on('error', () => {})

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
      child.stdin.end(script, 'utf8')
    })
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
}
