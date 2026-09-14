/**
 * Self-contained `file_list` capability for generated apps (generator-owned
 * runtime source; emitted verbatim into server/capabilities/file_list.js).
 * Plain JS, zero npm dependencies. Port of @mdt/capabilities file-tools.ts
 * (file_list) plus the security/paths.ts sandbox guard it depends on: every
 * listed entry is re-resolved through the sandbox guard, so a symlinked
 * entry that escapes the roots refuses the whole listing instead of leaking
 * names. Depth is capped at 5, entry count at 1000. Requires an explicit
 * filesystem grant — nothing is default-granted.
 */
import { realpathSync } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

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

function positiveInt(value, fallback, max, label) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`)
  if (n > max) throw new Error(`${label} must be ≤ ${max}`)
  return n
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
  requirePermission(ctx, 'file_list', 'filesystem')
  const userPath =
    input.path === undefined || input.path === null || input.path === '' ? '.' : input.path
  const resolved = sandboxResolve(ctx, userPath, 'file_list')
  const depth = positiveInt(input.depth, 1, 5, 'file_list: depth')
  const limit = positiveInt(input.limit, 200, 1000, 'file_list: limit')

  const rootStat = await fsp.stat(resolved)
  if (!rootStat.isDirectory()) throw new Error(`file_list: "${userPath}" is not a directory`)

  const entries = []
  let truncated = false
  const walk = async (dir, level) => {
    if (entries.length >= limit) {
      truncated = true
      return
    }
    const dirents = await fsp.readdir(dir, { withFileTypes: true })
    dirents.sort((a, b) => a.name.localeCompare(b.name))
    for (const dirent of dirents) {
      if (entries.length >= limit) {
        truncated = true
        return
      }
      // resolve EVERY entry through the sandbox guard — symlinked dirs that
      // escape throw here and the whole listing is refused
      const joined = path.join(dir, dirent.name)
      const real = resolveInSandbox({ roots: ctx.sandboxRoots, workdir: ctx.workdir }, joined)
      const stat = await fsp.stat(real)
      const isDir = stat.isDirectory()
      entries.push({
        name: dirent.name,
        path: real,
        type: isDir ? 'dir' : 'file',
        size: isDir ? 0 : stat.size,
      })
      if (isDir && level + 1 < depth) await walk(real, level + 1)
    }
  }
  await walk(resolved, 0)
  ctx.log(
    `file_list ${resolved} depth=${depth} entries=${entries.length}${truncated ? ' (truncated)' : ''}`,
  )
  return { entries, truncated }
}
