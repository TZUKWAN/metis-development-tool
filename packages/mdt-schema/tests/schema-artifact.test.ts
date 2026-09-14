import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { projectJsonSchema } from '../src/parse'

const artifactPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../schema/mdt-project.schema.json',
)

/**
 * Keeps the committed JSON Schema artifact in lockstep with the Zod source
 * (P04.01: "双源一致"). Update deliberately with `npm run gen:schema`;
 * plain `vitest run` fails when the artifact has drifted.
 */
describe('published JSON Schema artifact', () => {
  const generated = projectJsonSchema()

  it('generates a schema document with project definitions', () => {
    expect(generated.$schema).toContain('json-schema.org')
    const serialized = JSON.stringify(generated)
    expect(serialized).toContain('"schemaVersion"')
    expect(serialized).toContain('"pages"')
    expect(serialized).toContain('"agents"')
    expect(serialized).toContain('"interactions"')
    expect((generated as { required?: string[] }).required).toContain('schemaVersion')
  })

  it('committed artifact matches the generated schema (run gen:schema to refresh)', () => {
    expect(existsSync(artifactPath)).toBe(true)
    const committed = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, unknown>
    expect(committed).toEqual(generated)
  })

  it('regenerates the artifact when UPDATE_SCHEMA=1', () => {
    if (process.env.UPDATE_SCHEMA !== '1') {
      expect(process.env.UPDATE_SCHEMA).toBeUndefined()
      return
    }
    writeFileSync(artifactPath, JSON.stringify(generated, null, 2) + '\n')
    expect(existsSync(artifactPath)).toBe(true)
  })
})
