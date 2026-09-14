/**
 * Project schema migration framework (tasklist P04.14).
 *
 * A migration is a pure function `vN -> vN+1`. `migrateProjectJson` applies
 * the whole chain and never mutates its input; callers are responsible for
 * writing the original file to a backup location before persisting the
 * migrated result (see `packages/mdt-project`), so an old project is never
 * overwritten without a backup.
 */
import { z } from 'zod'

import { SCHEMA_VERSION, ProjectRootSchema } from './project'

export interface MigrationResult {
  ok: boolean
  /** migrated project data (already schema-validated when `ok`) */
  data?: unknown
  fromVersion: number
  toVersion: number
  /** human-readable summary of applied steps */
  appliedMigrations: string[]
  error?: string
}

type Migration = {
  from: number
  to: number
  name: string
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}

/**
 * Registered migration chain. Version 1 is the initial MDT format, so the
 * chain starts empty — add `v1 -> v2` here when the format evolves.
 */
export const migrations: Migration[] = []

export function registerMigration(m: Migration): void {
  if (m.from + 1 !== m.to) throw new Error(`migration ${m.name}: to must be from + 1`)
  migrations.push(m)
}

/** Strip unknown shape: the input may be any past schema version or garbage. */
const LegacyShape = z.object({ schemaVersion: z.number().int().nonnegative() }).passthrough()

export function migrateProjectJson(raw: unknown): MigrationResult {
  const parsed = LegacyShape.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      fromVersion: -1,
      toVersion: SCHEMA_VERSION,
      appliedMigrations: [],
      error: `not an MDT project document: ${parsed.error.issues[0]?.message ?? 'unparsable'}`,
    }
  }
  let data: Record<string, unknown> = parsed.data as Record<string, unknown>
  const fromVersion = Number(data.schemaVersion)
  if (fromVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      fromVersion,
      toVersion: SCHEMA_VERSION,
      appliedMigrations: [],
      error: `project schemaVersion ${fromVersion} is newer than this MDT supports (${SCHEMA_VERSION})`,
    }
  }
  const applied: string[] = []
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = migrations.find((m) => m.from === v)
    if (!step) {
      return {
        ok: false,
        fromVersion,
        toVersion: SCHEMA_VERSION,
        appliedMigrations: applied,
        error: `no migration registered for schemaVersion ${v} -> ${v + 1}`,
      }
    }
    data = step.migrate(data)
    applied.push(step.name)
  }
  const validated = ProjectRootSchema.safeParse(data)
  if (!validated.success) {
    return {
      ok: false,
      fromVersion,
      toVersion: SCHEMA_VERSION,
      appliedMigrations: applied,
      error: `migrated project failed schema validation: ${validated.error.issues[0]?.message ?? 'invalid'}`,
    }
  }
  return {
    ok: true,
    data: validated.data,
    fromVersion,
    toVersion: SCHEMA_VERSION,
    appliedMigrations: applied,
  }
}
