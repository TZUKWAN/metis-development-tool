/**
 * Asset store (tasklist P05.06, P05.07) + project lock (P05.08).
 *
 * Assets are content-addressed: `<sha256><ext>` inside `assets/`, so re-
 * importing the same image is a no-op and the source file can be deleted
 * after import. GC only removes files not referenced by the project model,
 * supports dry-run, and never follows paths outside the assets directory.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { ProjectRoot } from '@mdt/schema'

import { atomicWriteFileSync, insideRoot, projectPaths, sha256 } from './layout'

export interface ImportedAsset {
  id: string
  path: string
  mime: string
  hash: string
  size: number
  originalName: string
  /** true when the bytes were already stored (dedup hit) */
  deduped: boolean
}

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
}

function mimeFor(name: string): string {
  const ext = path.extname(name).toLowerCase()
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

export class AssetStore {
  constructor(private readonly root: string) {}

  private get assetsDir(): string {
    return projectPaths(this.root).assetsDir
  }

  /** Import bytes from an already-read buffer; dedup by sha256. */
  import(fileName: string, bytes: Uint8Array, newId: () => string): ImportedAsset {
    const hash = sha256(bytes)
    const ext = path.extname(fileName).toLowerCase() || '.bin'
    const stored = `${hash}${ext}`
    const target = path.join(this.assetsDir, stored)
    const deduped = fs.existsSync(target)
    if (!deduped) {
      atomicWriteFileSync(target, bytes)
    }
    return {
      id: newId(),
      path: `assets/${stored}`,
      mime: mimeFor(fileName),
      hash,
      size: bytes.byteLength,
      originalName: path.basename(fileName),
      deduped,
    }
  }

  /** Import from a file on disk (the file is copied, never moved). */
  importFrom(sourcePath: string, newId: () => string): ImportedAsset {
    const bytes = fs.readFileSync(sourcePath)
    return this.import(path.basename(sourcePath), new Uint8Array(bytes), newId)
  }

  /** Resolve a project-relative asset path to an absolute path, safely. */
  resolve(assetPath: string): string | null {
    if (!assetPath.startsWith('assets/')) return null
    const abs = path.join(this.root, assetPath)
    return insideRoot(this.root, abs) ? abs : null
  }

  read(assetPath: string): Buffer | null {
    const abs = this.resolve(assetPath)
    if (!abs) return null
    try {
      return fs.readFileSync(abs)
    } catch {
      return null
    }
  }

  /**
   * Garbage-collect unreferenced assets. `dryRun` returns what *would* be
   * removed. A path is referenced when the project model mentions it in an
   * asset record that an element actually uses (or when the caller passes
   * extra keep-paths for in-flight imports).
   */
  gc(
    project: ProjectRoot,
    options: { dryRun?: boolean; keep?: readonly string[] } = {},
  ): { removed: string[]; kept: string[] } {
    const referenced = new Set<string>(options.keep ?? [])
    for (const asset of project.assets) referenced.add(path.basename(asset.path))
    const removed: string[] = []
    const kept: string[] = []
    if (!fs.existsSync(this.assetsDir)) return { removed, kept }
    for (const entry of fs.readdirSync(this.assetsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (referenced.has(entry.name)) {
        kept.push(entry.name)
        continue
      }
      removed.push(entry.name)
      if (!options.dryRun) {
        fs.unlinkSync(path.join(this.assetsDir, entry.name))
      }
    }
    return { removed, kept }
  }
}

// ---------------------------------------------------------------------------
// Project lock (P05.08)
// ---------------------------------------------------------------------------

export interface ProjectLock {
  pid: number
  host: string
  acquiredAt: string
}

/** Try to acquire the project lock; returns the existing holder on conflict. */
export function acquireLock(
  root: string,
  lock: ProjectLock,
): { ok: boolean; heldBy?: ProjectLock } {
  const file = projectPaths(root).lockFile
  try {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectLock
    // stale lock from a dead process (crash) — reclaimable
    if (existing.pid && !processExists(existing.pid)) {
      atomicWriteFileSync(file, JSON.stringify(lock, null, 2))
      return { ok: true }
    }
    return { ok: false, heldBy: existing }
  } catch {
    atomicWriteFileSync(file, JSON.stringify(lock, null, 2))
    return { ok: true }
  }
}

export function releaseLock(root: string, lock: ProjectLock): void {
  const file = projectPaths(root).lockFile
  try {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectLock
    if (existing.pid === lock.pid) fs.unlinkSync(file)
  } catch {
    // no lock file — nothing to release
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}
