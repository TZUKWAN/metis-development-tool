import { describe, expect, test } from 'vitest'

import { generateProject } from '../src/generator'
import { GeneratorRefusedError } from '../src/types'
import { lintBlueprint } from '../src/lint'
import { builderPrompt } from '../src/prompt'
import { builtinManifests, goldenBlueprint, IDS } from './helpers/blueprint'

const manifests = builtinManifests()

describe('lint (P11.22)', () => {
  test('dangling agentRef (chat element referencing a missing agent) is an error', () => {
    const blueprint = goldenBlueprint()
    const pages = blueprint.pages.map((page) =>
      page.id === IDS.homePage
        ? {
            ...page,
            elements: page.elements.map((element) =>
              element.id === IDS.chatElement
                ? { ...element, semantics: { ...element.semantics, agentRef: IDS.detailsPage } }
                : element,
            ),
          }
        : page,
    )
    const report = lintBlueprint({ ...blueprint, pages }, manifests)
    expect(report.ok).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'element.agent.missing',
          severity: 'error',
        }),
      ]),
    )
  })

  test('missing capability required arg is an error', () => {
    const blueprint = goldenBlueprint()
    // add an invokeCapability interaction without the required "query" arg
    const interactions = [
      ...blueprint.interactions,
      {
        id: IDS.projectVariable, // reuse a valid id-shaped value
        sourcePageId: IDS.homePage,
        sourceElementId: IDS.searchButton,
        trigger: 'click' as const,
        enabled: true,
        action: {
          type: 'invokeCapability' as const,
          capabilityInstanceId: IDS.webSearchInstance,
          args: { count: { type: 'literal' as const, value: 3 } },
        },
      },
    ]
    const report = lintBlueprint({ ...blueprint, interactions }, manifests)
    expect(report.ok).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'interaction.capability.missingArg',
          severity: 'error',
          message: expect.stringContaining('"query"'),
        }),
      ]),
    )
  })

  test('openModal targeting a non-modal page (type mismatch) is an error', () => {
    const blueprint = goldenBlueprint()
    const interactions = blueprint.interactions.map((interaction) =>
      interaction.id === IDS.openModalInteraction
        ? { ...interaction, action: { type: 'openModal' as const, targetPageId: IDS.detailsPage } }
        : interaction,
    )
    const report = lintBlueprint({ ...blueprint, interactions }, manifests)
    expect(report.ok).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'interaction.targetPage.typeMismatch',
          severity: 'error',
        }),
      ]),
    )
  })

  test('capability instance with unknown registry id or missing required secret is an error', () => {
    const blueprint = goldenBlueprint()
    const capabilities = blueprint.capabilities.map((instance) =>
      instance.id === IDS.webFetchInstance
        ? { ...instance, capabilityId: 'totally_unknown' }
        : instance,
    )
    const report = lintBlueprint({ ...blueprint, capabilities }, manifests)
    expect(report.ok).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'capability.manifest.missing', severity: 'error' }),
      ]),
    )
  })

  test('the golden blueprint itself lints clean', () => {
    const report = lintBlueprint(goldenBlueprint(), manifests)
    expect(report.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(report.ok).toBe(true)
  })

  test('generation is refused when lint reports errors', () => {
    const blueprint = goldenBlueprint()
    const pages = blueprint.pages.map((page) =>
      page.id === IDS.homePage
        ? {
            ...page,
            elements: page.elements.map((element) =>
              element.id === IDS.chatElement
                ? { ...element, semantics: { ...element.semantics, agentRef: IDS.detailsPage } }
                : element,
            ),
          }
        : page,
    )
    expect(() =>
      generateProject({ ...blueprint, pages }, { capabilityManifests: manifests, outDir: '/tmp/x' }),
    ).toThrow(GeneratorRefusedError)
    try {
      generateProject({ ...blueprint, pages }, { capabilityManifests: manifests, outDir: '/tmp/x' })
    } catch (error) {
      expect((error as GeneratorRefusedError).issues.length).toBeGreaterThan(0)
    }
  })
})

describe('builder prompt (P10.08)', () => {
  const blueprint = goldenBlueprint()

  test('contains the contract sections and is deterministic', () => {
    const a = builderPrompt(blueprint, 'Add a citations panel to the Research page.', {
      blueprintPath: 'build/blueprint.json',
      manifests,
    })
    const b = builderPrompt(blueprint, 'Add a citations panel to the Research page.', {
      blueprintPath: 'build/blueprint.json',
      manifests,
    })
    expect(a).toBe(b)
    expect(a).toContain('build/blueprint.json')
    expect(a).toContain(blueprint.project.name)
    expect(a).toContain('npm run typecheck')
    expect(a).toContain('npm run test:e2e')
    expect(a).toContain('@earendil-works/pi-agent-core')
    expect(a).toContain('streamSimple')
    expect(a).toContain('Do NOT run `git commit`')
    expect(a).toContain('@openai/codex')
    expect(a).toContain('web_search')
    expect(a).toContain('data-mdt-id')
    expect(a).toContain('.mdt/generator-manifest.json')
  })

  test('prompt snapshot', () => {
    expect(
      builderPrompt(blueprint, 'Add a citations panel to the Research page.', {
        blueprintPath: 'build/blueprint.json',
        manifests,
      }),
    ).toMatchSnapshot('builder-prompt.txt')
  })
})
