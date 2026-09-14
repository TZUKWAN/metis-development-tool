/** Parse + validate entry points and the published JSON Schema artifact. */
import { z } from 'zod'

import { ProjectRootSchema, type ProjectRoot } from './project'

export interface ProjectParseSuccess {
  ok: true
  project: ProjectRoot
}

export interface ProjectParseFailure {
  ok: false
  /** machine-readable issues with JSON paths, suitable for the corrupted-project UI (P05.09) */
  issues: { path: string; message: string }[]
  error: string
}

export type ProjectParseResult = ProjectParseSuccess | ProjectParseFailure

/** Parse and validate a project document; issues carry exact field paths. */
export function parseProject(raw: unknown): ProjectParseResult {
  const result = ProjectRootSchema.safeParse(raw)
  if (result.success) return { ok: true, project: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    })),
    error: `invalid MDT project: ${result.error.issues.length} issue(s)`,
  }
}

/**
 * Published JSON Schema for the project format. Regenerate the committed
 * artifact with `npm run gen:schema -w @mdt/schema`; CI fails when stale.
 */
export function projectJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ProjectRootSchema, { io: 'input' }) as Record<string, unknown>
}
