/**
 * Deterministic fake Codex client (tasklist P14.08, P14.15): CI runs the
 * whole builder pipeline against this — scripted events, scripted file
 * edits, scripted failures — no credentials, no network, no processes.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { CodexClient, CodexEventListener, CodexTurnOptions, CodexTurnResult } from './types'

export interface FakeScriptStep {
  /** delay before the step fires, ms */
  delayMs?: number
  event: Parameters<CodexEventListener>[0]
}

export interface FakeTurnScript {
  /** prompt fragment required for this script to apply (first match wins) */
  matches?: string
  steps: FakeScriptStep[]
  result: CodexTurnResult
  /** files to write into the workspace when the turn starts */
  writeFiles?: Record<string, string>
  /** files to delete */
  deleteFiles?: string[]
  /** throw instead of running (simulates transport failure) */
  failWith?: string
}

export class FakeCodexClient implements CodexClient {
  readonly kind = 'fake' as const
  private listener: CodexEventListener | undefined
  private interrupted = false
  readonly turns: { prompt: string; options: CodexTurnOptions }[] = []
  disposed = false

  constructor(private scripts: FakeTurnScript[]) {}

  /** Append a script for a repair-loop turn decided at test time. */
  addScript(script: FakeTurnScript): void {
    this.scripts.push(script)
  }

  async start(listener: CodexEventListener): Promise<void> {
    this.listener = listener
  }

  async turn(prompt: string, options: CodexTurnOptions): Promise<CodexTurnResult> {
    this.turns.push({ prompt, options })
    const script =
      this.scripts.find((s) => !s.matches || prompt.includes(s.matches)) ??
      this.scripts[this.scripts.length - 1]
    if (!script)
      throw new Error(
        `FakeCodexClient: no script for prompt ${JSON.stringify(prompt.slice(0, 80))}`,
      )
    if (script.failWith) throw new Error(script.failWith)
    this.interrupted = false
    const emit = (step: FakeScriptStep) => {
      if (this.interrupted) return
      this.listener?.(step.event)
    }
    for (const step of script.steps) {
      if (step.delayMs) await delay(step.delayMs, options.signal)
      if (this.interrupted) break
      emit(step)
    }
    if (this.interrupted) {
      return { status: 'interrupted', responseText: '' }
    }
    if (script.writeFiles || script.deleteFiles) {
      for (const [rel, content] of Object.entries(script.writeFiles ?? {})) {
        const abs = path.join(options.cwd, rel)
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, content)
      }
      for (const rel of script.deleteFiles ?? []) {
        fs.rmSync(path.join(options.cwd, rel), { force: true })
      }
      this.listener?.({
        type: 'file_change_completed',
        files: Object.keys(script.writeFiles ?? {}),
      })
    }
    return { ...script.result }
  }

  async interrupt(): Promise<void> {
    this.interrupted = true
    this.listener?.({ type: 'turn_completed', status: 'interrupted' })
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}
