/**
 * Filesystem sandbox (tasklist P09.12–P09.14, P13.03).
 *
 * Every filesystem capability resolves user-supplied paths through here:
 * canonicalize (resolve symlinks + ..) then require containment in an
 * explicit sandbox root. Symlink escape is caught because we stat the real
 * path, not the requested one.
 */
import fs from 'node:fs'
import path from 'node:path'

export class PathEscapeError extends Error {
  readonly code = 'PATH_ESCAPE'
  constructor(message: string) {
    super(message)
    this.name = 'PathEscapeError'
  }
}

export interface PathSandbox {
  readonly roots: readonly string[]
  workdir?: string
}

function canonical(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    // target does not exist yet (write case): canonicalize the deepest
    // existing ancestor and append the remainder
    const abs = path.resolve(p)
    let parent = path.dirname(abs)
    const suffix: string[] = []
    while (parent !== abs) {
      try {
        return path.join(fs.realpathSync(parent), path.relative(parent, abs))
      } catch {
        suffix.push(path.basename(parent))
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
export function resolveInSandbox(sandbox: PathSandbox, userPath: string): string {
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
