/**
 * Structured build logs (tasklist P10.17): JSONL per build under
 * `<project>/.mdt/builds/<id>/log.jsonl`, every line redacted (P13.04).
 * Logs are complete enough to reproduce/audit a build.
 */
import fs from 'node:fs'
import path from 'node:path'

import { redactText } from './redact'

export interface BuildLogEntry {
  ts: string
  kind:
    | 'build_started'
    | 'codex_event'
    | 'quality_gate'
    | 'applied'
    | 'rolled_back'
    | 'failed'
    | 'cancelled'
    | 'build_finished'
  data: Record<string, unknown>
}

export class BuildLog {
  private readonly file: string
  private readonly memory: BuildLogEntry[] = []

  constructor(
    buildsDir: string,
    readonly buildId: string,
  ) {
    this.file = path.join(buildsDir, buildId, 'log.jsonl')
  }

  append(kind: BuildLogEntry['kind'], data: Record<string, unknown> = {}): void {
    const entry: BuildLogEntry = { ts: new Date().toISOString(), kind, data }
    this.memory.push(entry)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.appendFileSync(
      this.file,
      JSON.stringify(entry, (k, v) => (typeof v === 'string' ? redactText(v) : v)) + '\n',
    )
  }

  /** Read back a full build log (audit/replay). */
  readAll(): BuildLogEntry[] {
    try {
      return fs
        .readFileSync(this.file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as BuildLogEntry)
    } catch {
      return [...this.memory]
    }
  }
}

/** Rotate old build dirs, keeping the newest `keep` (P15.07). */
export function rotateBuildLogs(buildsDir: string, keep = 20): void {
  if (!fs.existsSync(buildsDir)) return
  const dirs = fs
    .readdirSync(buildsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, time: statMtime(path.join(buildsDir, d.name)) }))
    .sort((a, b) => b.time - a.time)
  for (const dir of dirs.slice(keep)) {
    fs.rmSync(path.join(buildsDir, dir.name), { recursive: true, force: true })
  }
}

function statMtime(dir: string): number {
  try {
    return fs.statSync(dir).mtimeMs
  } catch {
    return 0
  }
}
