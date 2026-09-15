/**
 * Sample projects (tasklist P17.10–P17.12): the three acceptance samples.
 * Each sample is materialized as a REAL MDT project directory under
 * fixtures/samples/<name>/ — mdt.project.json (the project document) plus
 * the generated application under generated/ — exactly what the desktop
 * app produces on Build. These directories feed the P18.07/P18.11
 * acceptance runs (three from-zero builds + standalone verification).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, test } from 'vitest'

import { CapabilityRegistry, registerBuiltins, type CapabilityManifest } from '@mdt/capabilities'
import type { BuildBlueprint, ProjectRoot } from '@mdt/schema'

import { generateAndWrite, lintBlueprint } from '../src/index'

const outRoot = join(__dirname, '../../../fixtures/samples')

/** Deterministic ids: the committed fixtures must be byte-stable across
 * regeneration runs (no randomness), while still satisfying the UUIDv7
 * identity pattern. */
let nextId: () => string

function fixedIdFactory(): () => string {
  let n = 0
  return () => `a0000000-0000-7000-8000-${String(++n).padStart(12, '0')}`
}

let manifests: Map<string, CapabilityManifest>

beforeAll(() => {
  nextId = fixedIdFactory()
  const registry = registerBuiltins(new CapabilityRegistry())
  manifests = new Map(registry.manifests().map((m) => [m.id, m]))
})

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------

interface SampleSpec {
  name: string
  agents: {
    name: string
    instructions: string
    capabilities: {
      capabilityId: string
      permissions: ProjectRoot['capabilities'][number]['permissions']
    }[]
    isDefault?: boolean
  }[]
  pages: {
    name: string
    type?: 'page' | 'modal' | 'drawer' | 'popover'
    elements: {
      name: string
      role: 'text' | 'input' | 'button' | 'list' | 'chat' | 'filepicker'
      label: string
      placeholder?: string
      x: number
      y: number
    }[]
  }[]
  interactions?: (
    pages: ProjectRoot['pages'],
    agents: ProjectRoot['agents'],
  ) => ProjectRoot['interactions']
}

function textElement(
  name: string,
  role: string,
  label: string,
  x: number,
  y: number,
  placeholder?: string,
): ProjectRoot['pages'][number]['elements'][number] {
  const element: ProjectRoot['pages'][number]['elements'][number] = {
    id: nextId(),
    name,
    role: role as ProjectRoot['pages'][number]['elements'][number]['role'],
    visual: {
      kind: role,
      geometry: { x, y, width: role === 'button' ? 140 : 520, height: 44 },
      style: role === 'text' ? { 'font-size': 32 } : {},
      props: role === 'button' ? { label } : {},
    },
    semantics: {
      handles:
        role === 'button' ? ['click'] : role === 'input' || role === 'filepicker' ? ['change'] : [],
      accessibility: { label },
      ...(placeholder ? { placeholder } : {}),
    },
    locked: false,
    hidden: false,
    children: [],
  }
  return element
}

function buildProject(spec: SampleSpec): ProjectRoot {
  const project: ProjectRoot = {
    schemaVersion: 1,
    id: nextId(),
    name: spec.name,
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    pages: [],
    components: [],
    agents: [],
    capabilities: [],
    interactions: [],
    bindings: [],
    variables: [],
    assets: [],
    settings: {
      theme: { colors: {}, fonts: {} },
      viewportPresets: [{ name: 'desktop-1440', width: 1440, height: 1024 }],
      locale: 'en',
      generator: { target: 'web-agent', dependencyOverrides: {} },
    },
  }

  for (const agentSpec of spec.agents) {
    const capabilityRefs: string[] = []
    for (const cap of agentSpec.capabilities) {
      const instance: ProjectRoot['capabilities'][number] = {
        id: nextId(),
        capabilityId: cap.capabilityId,
        version: '1.0.0',
        config: {},
        secrets: {},
        permissions: cap.permissions,
      }
      project.capabilities.push(instance)
      capabilityRefs.push(instance.id)
    }
    project.agents.push({
      id: nextId(),
      name: agentSpec.name,
      description: '',
      instructions: agentSpec.instructions,
      modelPolicy: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        api: 'openai-completions',
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      },
      capabilityRefs,
      memory: { enabled: false },
      isDefault: agentSpec.isDefault ?? false,
    })
  }

  for (const pageSpec of spec.pages) {
    project.pages.push({
      id: nextId(),
      name: pageSpec.name,
      type: pageSpec.type ?? 'page',
      viewport: { width: 1440, height: 1024, preset: 'desktop-1440' },
      background: {},
      elements: pageSpec.elements.map((el) =>
        textElement(el.name, el.role, el.label, el.x, el.y, el.placeholder),
      ),
      metadata: {},
    })
  }

  if (spec.interactions) {
    project.interactions.push(...spec.interactions(project.pages, project.agents))
  }
  if (project.agents.some((a) => a.isDefault)) {
    project.settings.defaultAgentId = project.agents.find((a) => a.isDefault)!.id
  }
  return project
}

function elementByName(
  page: ProjectRoot['pages'][number],
  name: string,
): ProjectRoot['pages'][number]['elements'][number] {
  const el = page.elements.find((e) => e.name === name)
  if (!el) throw new Error(`sample spec error: element "${name}" not found on "${page.name}"`)
  return el
}

// ---------------------------------------------------------------------------
// the three samples
// ---------------------------------------------------------------------------

const researchSpec: SampleSpec = {
  name: 'Web Research Agent',
  agents: [
    {
      name: 'Research Agent',
      instructions:
        'You are a web research assistant. Search the web, fetch the most relevant pages, and answer with a short list of findings. Always cite sources.',
      capabilities: [
        { capabilityId: 'web_search', permissions: [{ scope: 'network', granted: true }] },
        { capabilityId: 'web_fetch', permissions: [{ scope: 'network', granted: true }] },
      ],
      isDefault: true,
    },
  ],
  pages: [
    {
      name: 'Home',
      elements: [
        { name: 'Title', role: 'text', label: 'Web Research', x: 120, y: 60 },
        {
          name: 'Query Input',
          role: 'input',
          label: 'Query',
          placeholder: 'What do you want to research?',
          x: 120,
          y: 160,
        },
        { name: 'Search Button', role: 'button', label: 'Search', x: 660, y: 160 },
      ],
    },
    {
      name: 'Results',
      elements: [{ name: 'Findings List', role: 'list', label: 'Findings', x: 120, y: 80 }],
    },
  ],
  interactions: (pages, agents) => {
    const home = pages[0]!
    const results = pages[1]!
    return [
      {
        id: nextId(),
        sourcePageId: home.id,
        sourceElementId: elementByName(home, 'Search Button').id,
        trigger: 'click',
        enabled: true,
        action: {
          type: 'sendToAgent',
          agentId: agents[0]!.id,
          payload: { type: 'elementValue', elementId: elementByName(home, 'Query Input').id },
          chatElementId: undefined,
        },
      },
      {
        id: nextId(),
        sourcePageId: home.id,
        sourceElementId: elementByName(home, 'Search Button').id,
        trigger: 'click',
        enabled: true,
        action: { type: 'navigate', targetPageId: results.id },
      },
      {
        id: nextId(),
        sourcePageId: results.id,
        trigger: 'load',
        enabled: true,
        action: {
          type: 'bindOutput',
          source: { type: 'agentOutput', agentId: agents[0]!.id },
          targetElementId: elementByName(results, 'Findings List').id,
          property: 'items',
        },
      },
    ]
  },
}

const fileAnalystSpec: SampleSpec = {
  name: 'Local File Analyst',
  agents: [
    {
      name: 'File Analyst',
      instructions:
        'You are a file analyst. Read the file the user provides inside the workspace, summarize it, and answer questions about it. Never read outside the allowed directory.',
      capabilities: [
        {
          capabilityId: 'file_read',
          permissions: [{ scope: 'filesystem', detail: 'project workspace', granted: true }],
        },
      ],
      isDefault: true,
    },
  ],
  pages: [
    {
      name: 'Home',
      elements: [
        { name: 'Title', role: 'text', label: 'File Analyst', x: 120, y: 60 },
        { name: 'File Picker', role: 'filepicker', label: 'Choose a file', x: 120, y: 160 },
        { name: 'Analyst Chat', role: 'chat', label: 'Analyst', x: 120, y: 240 },
      ],
    },
  ],
}

const multiAgentSpec: SampleSpec = {
  name: 'Planner and Research',
  agents: [
    {
      name: 'Planner Agent',
      instructions:
        'You are a planner. Break the user request into concrete research questions. Answer with a numbered list.',
      capabilities: [],
      isDefault: true,
    },
    {
      name: 'Research Agent',
      instructions:
        'You are a web research assistant. Answer the given research question with a cited summary.',
      capabilities: [
        { capabilityId: 'web_search', permissions: [{ scope: 'network', granted: true }] },
      ],
    },
  ],
  pages: [
    {
      name: 'Home',
      elements: [
        { name: 'Title', role: 'text', label: 'Planner + Research', x: 120, y: 60 },
        {
          name: 'Request Input',
          role: 'input',
          label: 'Request',
          placeholder: 'What should we plan and research?',
          x: 120,
          y: 160,
        },
        { name: 'Plan Button', role: 'button', label: 'Plan', x: 660, y: 160 },
        { name: 'Plan Chat', role: 'chat', label: 'Planner', x: 120, y: 240 },
      ],
    },
    {
      name: 'Research',
      elements: [{ name: 'Research Chat', role: 'chat', label: 'Research', x: 120, y: 80 }],
    },
  ],
  interactions: (pages, agents) => {
    const home = pages[0]!
    const research = pages[1]!
    return [
      {
        id: nextId(),
        sourcePageId: home.id,
        sourceElementId: elementByName(home, 'Plan Button').id,
        trigger: 'click',
        enabled: true,
        action: {
          type: 'sendToAgent',
          agentId: agents[0]!.id,
          payload: { type: 'elementValue', elementId: elementByName(home, 'Request Input').id },
          chatElementId: elementByName(home, 'Plan Chat').id,
        },
      },
      {
        id: nextId(),
        sourcePageId: home.id,
        sourceElementId: elementByName(home, 'Plan Button').id,
        trigger: 'click',
        enabled: true,
        action: { type: 'navigate', targetPageId: research.id },
      },
    ]
  },
}

// ---------------------------------------------------------------------------
// materialize + verify
// ---------------------------------------------------------------------------

const specs: { dir: string; spec: SampleSpec }[] = [
  { dir: 'web-research-agent', spec: researchSpec },
  { dir: 'file-analyst', spec: fileAnalystSpec },
  { dir: 'planner-and-research', spec: multiAgentSpec },
]

describe.each(specs)('sample project: $dir', ({ dir, spec }) => {
  let project: ProjectRoot
  let blueprint: BuildBlueprint

  beforeAll(() => {
    project = buildProject(spec)
    blueprint = {
      blueprintVersion: 1,
      schemaVersion: 1,
      project: { id: project.id, name: project.name },
      pages: project.pages,
      components: project.components,
      agents: project.agents,
      capabilities: project.capabilities,
      interactions: project.interactions,
      bindings: project.bindings,
      variables: project.variables,
      assets: project.assets,
      settings: project.settings,
    }
  })

  test('lints clean', () => {
    const report = lintBlueprint(blueprint, manifests)
    const errors = report.issues.filter((i) => i.severity === 'error')
    expect(errors).toEqual([])
  })

  test('generates a complete app and is persisted as an MDT project', () => {
    const target = join(outRoot, dir)
    const result = generateAndWrite(blueprint, {
      capabilityManifests: manifests,
      outDir: join(target, 'generated'),
      projectRoot: target,
    })
    expect(result.files.length).toBeGreaterThan(20)
    // the project document is written after generation so ids are final
    writeFileSync(join(target, 'mdt.project.json'), JSON.stringify(project, null, 2) + '\n')
    // every capability the project uses must have a real emitted runtime
    for (const instance of project.capabilities) {
      expect(
        result.files.some((f) => f.path.includes(instance.capabilityId)),
        instance.capabilityId,
      ).toBe(true)
    }
  })
})
