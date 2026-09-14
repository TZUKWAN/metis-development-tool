import { afterEach, describe, expect, it } from 'vitest'

import { migrations, migrateProjectJson, registerMigration } from '../src/migrate'
import { SCHEMA_VERSION } from '../src/project'
import { emptyProject } from './helpers'

afterEach(() => {
  migrations.length = 0
})

describe('migration framework (P04.14)', () => {
  it('passes a current-version project through unchanged', () => {
    const project = emptyProject()
    const result = migrateProjectJson(JSON.parse(JSON.stringify(project)))
    expect(result.ok).toBe(true)
    expect(result.fromVersion).toBe(SCHEMA_VERSION)
    expect(result.appliedMigrations).toEqual([])
  })

  it('refuses documents that are not projects at all', () => {
    const result = migrateProjectJson({ hello: 'world' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not an MDT project document')
  })

  it('refuses projects from a newer schema version', () => {
    const project = emptyProject()
    const result = migrateProjectJson({
      ...(JSON.parse(JSON.stringify(project)) as Record<string, unknown>),
      schemaVersion: SCHEMA_VERSION + 5,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('newer than this MDT supports')
  })

  it('applies the registered v0->v1 step and validates the result', () => {
    registerMigration({
      from: 0,
      to: 1,
      name: 'v0-initial-baseline',
      migrate: (data) => ({ ...data, schemaVersion: 1 }),
    })
    const doc = emptyProject() as unknown as Record<string, unknown>
    const v0 = { ...JSON.parse(JSON.stringify(doc)), schemaVersion: 0 }
    const result = migrateProjectJson(v0)
    expect(result.ok).toBe(true)
    expect(result.appliedMigrations).toEqual(['v0-initial-baseline'])
    expect(result.fromVersion).toBe(0)
    expect(result.toVersion).toBe(SCHEMA_VERSION)
  })

  it('stops at the current schema version — later steps never run', () => {
    registerMigration({
      from: 0,
      to: 1,
      name: 'v0-to-v1',
      migrate: (d) => ({ ...d, schemaVersion: 1 }),
    })
    registerMigration({ from: 1, to: 2, name: 'v1-to-v2-future', migrate: (d) => d })
    const doc = emptyProject() as unknown as Record<string, unknown>
    const v0 = { ...JSON.parse(JSON.stringify(doc)), schemaVersion: 0 }
    const result = migrateProjectJson(v0)
    expect(result.ok).toBe(true)
    expect(result.appliedMigrations).toEqual(['v0-to-v1'])
  })

  it('fails with a clear error when a step is missing', () => {
    const doc = emptyProject() as unknown as Record<string, unknown>
    const v0 = { ...JSON.parse(JSON.stringify(doc)), schemaVersion: 0 }
    const result = migrateProjectJson(v0)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no migration registered for schemaVersion 0')
  })

  it('does not mutate the input document', () => {
    registerMigration({
      from: 0,
      to: 1,
      name: 'v0-to-v1',
      migrate: (d) => ({ ...d, schemaVersion: 1 }),
    })
    const doc = emptyProject() as unknown as Record<string, unknown>
    const v0 = { ...JSON.parse(JSON.stringify(doc)), schemaVersion: 0 }
    const snapshot = JSON.stringify(v0)
    migrateProjectJson(v0)
    expect(JSON.stringify(v0)).toBe(snapshot)
  })
})
