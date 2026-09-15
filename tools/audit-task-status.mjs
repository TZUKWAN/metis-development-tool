#!/usr/bin/env node
/**
 * Task-status auditor (V2 goal R00.01/R00.03).
 *
 * Validates TASK_STATUS.md against the canonical 310 task IDs extracted
 * from MDT_1.0_TASKLIST.md:
 *  - total count is exactly 310, IDs unique, none missing, none extra
 *  - every row has a legal status
 *  - every DONE row has verification evidence
 *  - DONE rows must not contain status-conflicting wording (deferred,
 *    later, gap, TODO, known issue, indirectly, placeholder, ...)
 *
 * Exit 0 = ledger consistent; exit 1 = problems found (printed).
 * `--json <out>` writes a machine-readable report.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tasklist = readFileSync(join(root, 'MDT_1.0_TASKLIST.md'), 'utf8')
const status = readFileSync(join(root, 'TASK_STATUS.md'), 'utf8')

// ---- canonical IDs from the tasklist ----
const canonical = [...tasklist.matchAll(/^### (P\d\d\.\d\d) /gm)].map((m) => m[1])
if (canonical.length !== 310) {
  console.error(`FATAL: tasklist yielded ${canonical.length} IDs, expected 310`)
  process.exit(1)
}

// ---- rows from TASK_STATUS.md ----
const LEGAL = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REOPENED', 'DONE']
const rows = new Map()
for (const line of status.split('\n')) {
  const m = line.match(/^\| (P\d\d\.\d\d) \| (TODO|IN_PROGRESS|BLOCKED|REOPENED|DONE)\b/i)
  if (!m) continue
  const id = m[1]
  const statusValue = m[2].toUpperCase()
  if (rows.has(id)) {
    console.error(`FATAL: duplicate row for ${id}`)
    process.exit(1)
  }
  const cells = line.split('|').map((c) => c.trim())
  const verification = cells[5] ?? ''
  const notes = cells[6] ?? ''
  rows.set(id, { id, status: statusValue, verification, notes, line })
}

const problems = []
const conflicts = /deferred|later\b|\bgap\b|\btodo\b|known issue|indirectly|placeholder|not implemented|follow-up|defer/i

// coverage checks
for (const id of canonical) {
  if (!rows.has(id)) problems.push(`MISSING: ${id} has no row in TASK_STATUS.md`)
}
for (const id of rows.keys()) {
  if (!canonical.includes(id)) problems.push(`EXTRA: ${id} is not a canonical task ID`)
}

const counts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, REOPENED: 0, DONE: 0 }
const reopenedEvidence = []
for (const row of rows.values()) {
  if (!(row.status in counts)) {
    problems.push(`ILLEGAL STATUS: ${row.id} = ${row.status}`)
    continue
  }
  counts[row.status]++
  if (row.status === 'DONE') {
    if (row.verification.length < 5) problems.push(`DONE WITHOUT VERIFICATION: ${row.id}`)
    if (conflicts.test(row.notes)) {
      problems.push(`DONE WITH CONFLICTING NOTES: ${row.id}: "${row.notes.slice(0, 120)}"`)
      reopenedEvidence.push({ id: row.id, notes: row.notes.slice(0, 200) })
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  canonicalTotal: canonical.length,
  rowCount: rows.size,
  counts,
  todoIds: [...rows.values()].filter((r) => r.status === 'TODO').map((r) => r.id),
  reopenedEvidence,
  problems,
}
if (process.argv[2] === '--json') {
  writeFileSync(join(root, process.argv[3] ?? 'docs/release/task-status-audit.json'), JSON.stringify(report, null, 2) + '\n')
}

console.log(`canonical=310 rows=${rows.size} ` + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '))
for (const problem of problems) console.log(problem)
if (problems.length > 0) process.exit(1)
