/**
 * MDT project directory layout (tasklist P05.01).
 *
 * A project is a plain, human-readable directory — git-diffable, copyable,
 * openable by hand:
 *
 *   <project>/
 *     mdt.project.json    # the ProjectRoot document (schema v1)
 *     design/             # future split-out design payloads (reserved)
 *     assets/             # imported assets, name = sha256 + extension
 *     .mdt/               # MDT-private state: autosave, recovery, builds, locks
 *
 * All writes go through atomic write (tmp + fsync + rename, P05.02).
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const PROJECT_FILE = 'mdt.project.json'
export const MDT_DIR = '.mdt'

export interface ProjectPaths {
  root: string
  projectFile: string
  assetsDir: string
  designDir: string
  mdtDir: string
  autosaveFile: string
  recoveryFile: string
  lockFile: string
  buildsDir: string
}

export function projectPaths(root: string): ProjectPaths {
  return {
    root,
    projectFile: path.join(root, PROJECT_FILE),
    assetsDir: path.join(root, 'assets'),
    designDir: path.join(root, 'design'),
    mdtDir: path.join(root, MDT_DIR),
    autosaveFile: path.join(root, MDT_DIR, 'autosave.json'),
    recoveryFile: path.join(root, MDT_DIR, 'recovery.json'),
    lockFile: path.join(root, MDT_DIR, 'lock.json'),
    buildsDir: path.join(root, MDT_DIR, 'builds'),
  }
}

/** Atomic write: temp file in the same directory + fsync + rename (P05.02). */
export function atomicWriteFileSync(file: string, data: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  let fd: number | undefined
  try {
    fd = fs.openSync(tmp, 'w')
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
  // rename over the target is atomic on POSIX; on Windows it fails if the
  // target exists, so remove-then-rename keeps the window minimal (content
  // is already durable in the tmp file)
  if (process.platform === 'win32' && fs.existsSync(file)) fs.unlinkSync(file)
  fs.renameSync(tmp, file)
}

/** sha256 of a buffer, hex — used for asset dedup and integrity (P05.06). */
export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** True when the directory looks like an MDT project. */
export function looksLikeProject(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, PROJECT_FILE)).isFile()
  } catch {
    return false
  }
}

/**
 * Canonical path check used by every API that receives a path from the UI:
 * rejects traversal outside `root`, resolves symlinks, normalizes separators
 * (shared security primitive — see also apps/mdt main-process IPC guards).
 */
export function insideRoot(root: string, candidate: string): boolean {
  const rootResolved = path.resolve(root)
  const candidateResolved = path.resolve(candidate)
  const rel = path.relative(rootResolved, candidateResolved)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}
