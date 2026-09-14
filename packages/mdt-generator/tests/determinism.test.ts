import { describe, expect, test } from 'vitest'

import { blueprintHash, toBuildBlueprint } from '@mdt/schema'
import { emptyProject } from '@mdt/schema/testing'
import type { CapabilityManifest } from '@mdt/capabilities'

import { generateProject } from '../src/generator'
import { builtinManifests, goldenBlueprint, IDS } from './helpers/blueprint'

const manifests = builtinManifests()

describe('determinism (P11.01)', () => {
  test('canvas position metadata does not change emitted files', () => {
    const baseline = goldenBlueprint()
    // simulate the designer dragging a page node on the interaction canvas:
    // the real pipeline projects the project through toBuildBlueprint, which
    // strips canvas UI state before hashing/generating
    const project = emptyProject({
      id: baseline.project.id,
      name: baseline.project.name,
      pages: baseline.pages.map((page) =>
        page.id === IDS.homePage
          ? { ...page, metadata: { ...page.metadata, canvasPosition: { x: 987, y: 654 } } }
          : page,
      ),
      agents: baseline.agents,
      capabilities: baseline.capabilities,
      interactions: baseline.interactions,
      bindings: baseline.bindings,
      variables: baseline.variables,
      assets: baseline.assets,
      settings: baseline.settings,
    })
    const movedBlueprint = toBuildBlueprint(project)

    expect(blueprintHash(movedBlueprint)).toBe(blueprintHash(baseline))

    const options = (): {
      capabilityManifests: Map<string, CapabilityManifest>
      outDir: string
    } => ({
      capabilityManifests: manifests,
      outDir: '/tmp/mdt-determinism-unused',
    })
    const a = generateProject(baseline, options())
    const b = generateProject(movedBlueprint, options())
    expect(b.files.map((file) => [file.path, file.content])).toEqual(
      a.files.map((file) => [file.path, file.content]),
    )
    expect(b.copiedAssets).toEqual(a.copiedAssets)
  })

  test('background color changes DO change emitted files (sanity)', () => {
    const baseline = goldenBlueprint()
    const tinted = goldenBlueprint()
    const tintedPages = tinted.pages.map((page) =>
      page.id === IDS.homePage ? { ...page, background: { color: '#fafbff' } } : page,
    )
    const a = generateProject(baseline, { capabilityManifests: manifests, outDir: '/tmp/x' })
    const b = generateProject(
      { ...tinted, pages: tintedPages },
      { capabilityManifests: manifests, outDir: '/tmp/x' },
    )
    expect(a.files).not.toEqual(b.files)
  })
})
