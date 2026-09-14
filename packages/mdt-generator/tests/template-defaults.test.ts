/**
 * Materializes the template's pre-generation defaults (a runnable demo app
 * inside templates/web-agent). The defaults ARE generator output for the
 * golden blueprint, which keeps template and generator conventions from
 * drifting. Gated behind MDT_EMIT_TEMPLATE_DEFAULTS=1 — run explicitly:
 *
 *   MDT_EMIT_TEMPLATE_DEFAULTS=1 npx vitest run tests/template-defaults.test.ts
 */
import { describe, expect, test } from 'vitest'

import { generateAndWrite, templateDirFor } from '../src/generator'
import { builtinManifests, goldenBlueprint } from './helpers/blueprint'

describe.skipIf(process.env.MDT_EMIT_TEMPLATE_DEFAULTS !== '1')('template defaults', () => {
  test('emit the golden demo project into templates/web-agent', () => {
    const outDir = templateDirFor({ capabilityManifests: new Map(), outDir: '.' })
    const result = generateAndWrite(goldenBlueprint(), {
      capabilityManifests: builtinManifests(),
      outDir,
    })
    expect(result.conflicts).toEqual([])
    expect(result.files.length).toBeGreaterThan(40)
  })
})
