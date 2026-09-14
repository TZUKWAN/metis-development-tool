/**
 * Self-contained `file_write` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/file_write.js).
 * Plain JS, zero npm dependencies. Port of @mdt/capabilities file-tools.ts
 * (file_write) plus the security/paths.ts sandbox guard it depends on:
 * every path is canonicalized (symlinks + .. resolved, with a
 * deepest-existing-ancestor fallback for not-yet-existing files) and must
 * stay inside an explicit sandbox root. Overwrite is opt-in (default false);
 * missing parent directories are created unless mkdirs=false. Requires an
 * explicit filesystem grant — nothing is default-granted.
 */
import { existsSync, realpathSync } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const ENCODINGS = ['utf8', 'base64']

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
    // target does not exist yet (write case): canonicalize the deepest
    // existing ancestor and append the remainder
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

function normalizeEncoding(value, label) {
  if (value === undefined || value === null || value === '') return 'utf8'
  const encoding = String(value)
  if (!ENCODINGS.includes(encoding)) {
    throw new Error(`${label}: encoding must be utf8 or base64 — got "${encoding}"`)
  }
  return encoding
}

/** Shared resolution step: throws PathEscapeError on escape. */
function sandboxResolve(ctx, userPath, label) {
  if (typeof userPath !== 'string' || userPath === '') {
    throw new PathEscapeError(`${label}: "path" is required and must be a non-empty string`)
  }
  if (!Array.isArray(ctx.sandboxRoots) || ctx.sandboxRoots.length === 0) {
    throw new PathEscapeError(
      `${label}: no sandbox roots configured in this project — cannot resolve "${userPath}"`,
    )
  }
  return resolveInSandbox({ roots: ctx.sandboxRoots, workdir: ctx.workdir }, userPath)
}

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

export async function execute(input, ctx) {
  requirePermission(ctx, 'file_write', 'filesystem')
  const resolved = sandboxResolve(ctx, input.path, 'file_write')
  if (input.content === undefined || input.content === null)
    throw new Error('file_write: "content" is required')
  const encoding = normalizeEncoding(input.encoding, 'file_write')
  const overwrite = input.overwrite === true
  const mkdirs = input.mkdirs !== false

  const existed = existsSync(resolved)
  if (existed && !overwrite) {
    throw new Error(
      `file_write: "${input.path}" already exists — pass overwrite: true to replace it`,
    )
  }
  if (existed) {
    const stat = await fsp.stat(resolved)
    if (stat.isDirectory())
      throw new Error(`file_write: "${input.path}" is a directory and cannot be written as a file`)
  }
  const buffer =
    encoding === 'base64'
      ? Buffer.from(String(input.content), 'base64')
      : Buffer.from(String(input.content), 'utf8')
  const parent = path.dirname(resolved)
  if (!existsSync(parent)) {
    if (!mkdirs)
      throw new Error(`file_write: parent directory "${parent}" does not exist and mkdirs=false`)
    await fsp.mkdir(parent, { recursive: true })
  }
  await fsp.writeFile(resolved, buffer)
  ctx.log(`file_write ${resolved} (${buffer.byteLength}B, ${existed ? 'overwritten' : 'created'})`)
  return { path: resolved, bytes: buffer.byteLength, created: !existed }
}
