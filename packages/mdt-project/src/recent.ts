/**
 * Recent projects list (tasklist P05.05) — stored in the MDT user-data
 * directory, tolerant of stale/missing paths (UI offers removal, never
 * crashes). The Electron main injects the storage file location.
 */
import fs from 'node:fs'
import path from 'node:path'

import { atomicWriteFileSync } from './layout'

export interface RecentEntry {
  path: string
  name: string
  lastOpenedAt: string
}

/** Canonicalize a path for identity comparison (case-insensitive on win32). */
function identityPath(p: string): string {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export class RecentProjects {
  constructor(private readonly file: string) {}

  list(): RecentEntry[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { entries?: RecentEntry[] }
      return (raw.entries ?? []).filter((e) => typeof e.path === 'string')
    } catch {
      return []
    }
  }

  /** Record an open; most-recent first, deduped by canonical path. */
  record(projectPath: string, name: string, now = new Date().toISOString()): RecentEntry[] {
    const key = identityPath(projectPath)
    const entries = this.list().filter((e) => identityPath(e.path) !== key)
    const next = [{ path: path.resolve(projectPath), name, lastOpenedAt: now }, ...entries].slice(
      0,
      20,
    )
    this.persist(next)
    return next
  }

  remove(projectPath: string): RecentEntry[] {
    const key = identityPath(projectPath)
    const next = this.list().filter((e) => identityPath(e.path) !== key)
    this.persist(next)
    return next
  }

  /** Drop entries whose directory no longer exists (call when listing). */
  pruneExisting(): RecentEntry[] {
    const next = this.list().filter((e) => fs.existsSync(e.path))
    if (next.length !== this.list().length) this.persist(next)
    return next
  }

  private persist(entries: RecentEntry[]): void {
    atomicWriteFileSync(this.file, JSON.stringify({ entries }, null, 2))
  }
}
