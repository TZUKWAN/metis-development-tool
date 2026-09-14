/**
 * Test fixture factories for the MDT project model.
 *
 * Exported as `@mdt/schema/testing` — a dedicated entry point so production
 * bundles never pull it in, while downstream packages (`@mdt/project`,
 * `@mdt/interactions`, `@mdt/capabilities`, the generator and app tests)
 * share one coherent set of builders.
 */
import { createId } from './ids'
import { SCHEMA_VERSION, type Agent, type Element, type Page, type ProjectRoot } from './project'

export function textElement(overrides: Partial<Element> = {}): Element {
  return {
    id: createId(),
    name: 'Title',
    role: 'text',
    visual: {
      kind: 'text',
      geometry: { x: 100, y: 80, width: 400, height: 60 },
      style: { 'font-size': 32 },
      props: { text: 'Welcome' },
    },
    semantics: { handles: [], accessibility: { label: 'Welcome' } },
    locked: false,
    hidden: false,
    children: [],
    ...overrides,
  }
}

export function buttonElement(overrides: Partial<Element> = {}): Element {
  return textElement({
    name: 'Search Button',
    role: 'button',
    visual: {
      kind: 'button',
      geometry: { x: 100, y: 200, width: 120, height: 44 },
      style: {},
      props: { label: 'Search' },
    },
    semantics: { handles: ['click'], accessibility: { label: 'Search' } },
    ...overrides,
  })
}

export function inputElement(overrides: Partial<Element> = {}): Element {
  return textElement({
    name: 'Query Input',
    role: 'input',
    visual: {
      kind: 'input',
      geometry: { x: 100, y: 120, width: 360, height: 44 },
      style: {},
      props: { placeholder: 'Ask anything' },
    },
    semantics: { handles: ['change'], placeholder: 'Ask anything', accessibility: { label: 'Query' } },
    ...overrides,
  })
}

export function homePage(overrides: Partial<Page> = {}): Page {
  return {
    id: createId(),
    name: 'Home',
    type: 'page',
    viewport: { width: 1440, height: 1024, preset: 'desktop-1440' },
    background: {},
    elements: [],
    metadata: {},
    ...overrides,
  }
}

export function researchAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: createId(),
    name: 'Research Agent',
    description: 'Searches the web and summarizes',
    instructions: 'You are a research assistant.',
    modelPolicy: { provider: 'openai', model: 'gpt-5.1', api: 'openai-completions' },
    capabilityRefs: [],
    memory: { enabled: false },
    isDefault: true,
    ...overrides,
  }
}

export function emptyProject(overrides: Partial<ProjectRoot> = {}): ProjectRoot {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId(),
    name: 'Sample Project',
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
      viewportPresets: [
        { name: 'desktop-1440', width: 1440, height: 1024 },
        { name: 'tablet-1024', width: 1024, height: 1366 },
        { name: 'mobile-390', width: 390, height: 844 },
      ],
      locale: 'en',
      generator: { target: 'web-agent', dependencyOverrides: {} },
    },
    ...overrides,
  }
}

export { createId }
