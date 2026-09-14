/**
 * Autosave with backpressure (tasklist P05.03, P15.05) and crash recovery
 * (P05.04).
 *
 * `AutosaveController` debounces bursts of edits: the first change schedules
 * a save after `debounceMs`; further changes during the window do not extend
 * it unboundedly (max delay cap), and a save is never re-entrantly started.
 * Failed autosaves keep the dirty flag so the UI can surface the failure —
 * the in-memory model is never considered saved just because a write failed.
 */
import fs from 'node:fs'

import type { ProjectRoot } from '@mdt/schema'

import { atomicWriteFileSync, projectPaths, type ProjectPaths } from './layout'

export interface AutosaveOptions {
  debounceMs?: number
  /** hard cap between schedule and write even under continuous editing */
  maxDelayMs?: number
  writeFile?: (file: string, json: string) => void
  now?: () => number
}

export interface AutosaveState {
  dirty: boolean
  lastError?: string
  lastSavedAt?: number
}

const DEFAULTS = { debounceMs: 1_500, maxDelayMs: 8_000 }

export class AutosaveController {
  private readonly opts: Required<AutosaveOptions>
  private timer: ReturnType<typeof setTimeout> | undefined
  private scheduledAt = 0
  private firstPendingAt = 0
  private saving = false
  private pending: ProjectRoot | undefined
  private _state: AutosaveState = { dirty: false }

  constructor(
    private readonly root: string,
    options: AutosaveOptions = {},
  ) {
    this.opts = { ...DEFAULTS, writeFile: defaultWrite, now: () => Date.now(), ...options }
  }

  get state(): AutosaveState {
    return { ...this._state }
  }

  get paths(): ProjectPaths {
    return projectPaths(this.root)
  }

  /** Call after every mutation; debounced, coalesced, failure-preserving. */
  touch(project: ProjectRoot): void {
    this.pending = project
    this._state.dirty = true
    const now = this.opts.now()
    if (this.timer === undefined) {
      this.firstPendingAt = now
      this.scheduledAt = now + this.opts.debounceMs
      this.timer = setTimeout(() => void this.flush(), this.opts.debounceMs)
    } else if (now - this.firstPendingAt >= this.opts.maxDelayMs - this.opts.debounceMs) {
      // continuous editing: cap the total delay instead of pushing it out forever
      clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.flush(), Math.max(0, this.scheduledAt - now))
    }
  }

  /** Write now if dirty; used on app blur, close, and explicit Ctrl+S paths. */
  flush(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (this.saving || !this._state.dirty || !this.pending) return
    this.saving = true
    try {
      const json = JSON.stringify(this.pending, null, 2) + '\n'
      this.opts.writeFile(this.paths.autosaveFile, json)
      this._state = { dirty: false, lastSavedAt: this.opts.now() }
      this.pending = undefined
    } catch (err) {
      // keep dirty + pending so the next touch retries; surface the error
      this._state = { ...this._state, dirty: true, lastError: (err as Error).message }
    } finally {
      this.saving = false
    }
  }

  /** Mark the project saved through the normal save path. */
  markSaved(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this._state = { dirty: false, lastSavedAt: this.opts.now() }
    this.pending = undefined
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }
}

function defaultWrite(file: string, json: string): void {
  atomicWriteFileSync(file, json)
}

// ---------------------------------------------------------------------------
// Crash recovery (P05.04)
// ---------------------------------------------------------------------------

export interface RecoveryPoint {
  savedAt: string
  project: ProjectRoot
}

/** Write a recovery snapshot (called periodically while editing). */
export function writeRecoverySnapshot(
  root: string,
  project: ProjectRoot,
  savedAt = new Date().toISOString(),
): void {
  const payload = { savedAt, project }
  atomicWriteFileSync(projectPaths(root).recoveryFile, JSON.stringify(payload, null, 2))
}

/** Read a pending recovery point, or null when there is none / it is stale. */
export function readRecoverySnapshot(root: string): RecoveryPoint | null {
  const file = projectPaths(root).recoveryFile
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      savedAt: string
      project: ProjectRoot
    }
    if (!raw || typeof raw.savedAt !== 'string' || !raw.project) return null
    return raw
  } catch {
    return null
  }
}

/** Remove the recovery file after the user chose restore or discard. */
export function clearRecoverySnapshot(root: string): void {
  try {
    fs.unlinkSync(projectPaths(root).recoveryFile)
  } catch {
    // already gone — recovery cleared
  }
}
