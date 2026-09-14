/**
 * Shared golden blueprint: 3 pages incl. a modal, chat + button + input +
 * list, one agent with web_search + web_fetch, interactions covering
 * navigate / openModal / sendToAgent / bindOutput / setVariable / close /
 * back, session + project variables, and an asset. Fixed UUIDv7-shaped ids
 * so generation output is byte-stable across runs.
 */
import type {
  Agent,
  Asset,
  BuildBlueprint,
  CapabilityInstance,
  DataBinding,
  Element,
  Interaction,
  Page,
  Variable,
} from '@mdt/schema'
import { CapabilityRegistry, registerBuiltins, type CapabilityManifest } from '@mdt/capabilities'

function id(hex: string): string {
  const body = hex.padStart(12, '0').slice(0, 12)
  return `01990000-7000-7000-8000-${body}`
}

export const IDS = {
  project: id('000000000001'),
  homePage: id('010000000001'),
  researchPage: id('010000000002'),
  detailsPage: id('010000000003'),
  searchModal: id('010000000004'),
  titleText: id('020000000001'),
  queryInput: id('020000000002'),
  searchButton: id('020000000003'),
  openModalButton: id('020000000004'),
  chatElement: id('020000000005'),
  resultList: id('020000000006'),
  detailsTitle: id('020000000007'),
  backButton: id('020000000008'),
  modalInput: id('020000000009'),
  modalSubmitButton: id('02000000000a'),
  viewDetailsButton: id('02000000000b'),
  resultCodeBlock: id('02000000000c'),
  agent: id('030000000001'),
  webSearchInstance: id('040000000001'),
  webFetchInstance: id('040000000002'),
  datetimeInstance: id('040000000003'),
  sendToAgentInteraction: id('050000000001'),
  openModalInteraction: id('050000000002'),
  backInteraction: id('050000000003'),
  closeModalInteraction: id('050000000004'),
  navigateInteraction: id('050000000005'),
  bindOutputInteraction: id('050000000006'),
  setVariableInteraction: id('050000000007'),
  sessionVariable: id('060000000001'),
  projectVariable: id('060000000002'),
  inputVariableBinding: id('070000000001'),
  agentTextBinding: id('070000000002'),
  heroAsset: id('080000000001'),
} as const

function element(partial: Pick<Element, 'id' | 'name' | 'role'> & Partial<Element>): Element {
  return {
    visual: {
      kind: partial.role,
      geometry: { x: 40, y: 40, width: 320, height: 44 },
      style: {},
      props: {},
    },
    semantics: { handles: [] },
    locked: false,
    hidden: false,
    children: [],
    ...partial,
  }
}

function page(partial: Pick<Page, 'id' | 'name' | 'type'> & Partial<Page>): Page {
  return {
    viewport: { width: 1440, height: 1024, preset: 'desktop-1440' },
    background: {},
    elements: [],
    metadata: {},
    ...partial,
  }
}

/** Registry manifests for the built-in capability set. */
export function builtinManifests(): Map<string, CapabilityManifest> {
  const registry = registerBuiltins(new CapabilityRegistry())
  return new Map(registry.manifests().map((manifest) => [manifest.id, manifest]))
}

export function goldenBlueprint(): BuildBlueprint {
  const homePage = page({
    id: IDS.homePage,
    name: 'Home',
    type: 'page',
    background: { color: '#ffffff' },
    elements: [
      element({
        id: IDS.titleText,
        name: 'Title',
        role: 'text',
        visual: {
          kind: 'text',
          geometry: { x: 40, y: 24, width: 640, height: 60 },
          style: { 'font-size': 32 },
          props: { text: 'Research Assistant' },
        },
        semantics: { handles: [], accessibility: { label: 'Research Assistant' } },
      }),
      element({
        id: IDS.queryInput,
        name: 'Query Input',
        role: 'input',
        semantics: {
          handles: ['change'],
          placeholder: 'Ask anything',
          accessibility: { label: 'Query' },
        },
      }),
      element({
        id: IDS.searchButton,
        name: 'Search Button',
        role: 'button',
        visual: {
          kind: 'button',
          geometry: { x: 400, y: 40, width: 120, height: 44 },
          style: {},
          props: { label: 'Search' },
        },
        semantics: { handles: ['click'], accessibility: { label: 'Search' } },
      }),
      element({
        id: IDS.openModalButton,
        name: 'New Research Button',
        role: 'button',
        visual: {
          kind: 'button',
          geometry: { x: 540, y: 40, width: 140, height: 44 },
          style: {},
          props: { label: 'New research…' },
        },
        semantics: { handles: ['click'], accessibility: { label: 'New research' } },
      }),
      element({
        id: IDS.chatElement,
        name: 'Research Chat',
        role: 'chat',
        visual: {
          kind: 'chat',
          geometry: { x: 40, y: 120, width: 640, height: 520 },
          style: {},
          props: {},
        },
        semantics: {
          handles: ['click'],
          agentRef: IDS.agent,
          placeholder: 'Message the research agent…',
          accessibility: { label: 'Research chat' },
        },
      }),
    ],
  })

  const researchPage = page({
    id: IDS.researchPage,
    name: 'Research',
    type: 'page',
    elements: [
      element({
        id: IDS.resultList,
        name: 'Result List',
        role: 'list',
        visual: {
          kind: 'list',
          geometry: { x: 40, y: 120, width: 640, height: 420 },
          style: {},
          props: { items: ['Run a search to populate results'] },
        },
        semantics: { handles: ['click'], accessibility: { label: 'Results' } },
      }),
      element({
        id: IDS.resultCodeBlock,
        name: 'Raw Result',
        role: 'codeblock',
        visual: {
          kind: 'codeblock',
          geometry: { x: 720, y: 120, width: 640, height: 420 },
          style: {},
          props: { text: 'awaiting results…' },
        },
        semantics: { handles: [], accessibility: { label: 'Raw result' } },
      }),
      element({
        id: IDS.viewDetailsButton,
        name: 'View Details Button',
        role: 'button',
        visual: {
          kind: 'button',
          geometry: { x: 40, y: 40, width: 160, height: 44 },
          style: {},
          props: { label: 'View details' },
        },
        semantics: { handles: ['click'], accessibility: { label: 'View details' } },
      }),
    ],
  })

  const detailsPage = page({
    id: IDS.detailsPage,
    name: 'Details',
    type: 'page',
    elements: [
      element({
        id: IDS.detailsTitle,
        name: 'Details Title',
        role: 'text',
        visual: {
          kind: 'text',
          geometry: { x: 40, y: 40, width: 640, height: 60 },
          style: { 'font-size': 28 },
          props: { text: 'Result details' },
        },
        semantics: { handles: [], accessibility: { label: 'Result details' } },
      }),
      element({
        id: IDS.backButton,
        name: 'Back Button',
        role: 'button',
        visual: {
          kind: 'button',
          geometry: { x: 40, y: 120, width: 120, height: 44 },
          style: {},
          props: { label: 'Back' },
        },
        semantics: { handles: ['click'], accessibility: { label: 'Back' } },
      }),
    ],
  })

  const searchModal = page({
    id: IDS.searchModal,
    name: 'New Research',
    type: 'modal',
    viewport: { width: 640, height: 320 },
    metadata: { modalDismissible: true },
    elements: [
      element({
        id: IDS.modalInput,
        name: 'Topic Input',
        role: 'input',
        semantics: {
          handles: ['change'],
          placeholder: 'Research topic…',
          accessibility: { label: 'Topic' },
        },
      }),
      element({
        id: IDS.modalSubmitButton,
        name: 'Start Button',
        role: 'button',
        visual: {
          kind: 'button',
          geometry: { x: 480, y: 240, width: 120, height: 44 },
          style: {},
          props: { label: 'Start' },
        },
        semantics: { handles: ['click'], accessibility: { label: 'Start' } },
      }),
    ],
  })

  const agent: Agent = {
    id: IDS.agent,
    name: 'Research Agent',
    description: 'Searches the web and summarizes',
    instructions: 'You are a meticulous research assistant. Always cite sources.',
    modelPolicy: {
      provider: 'openai',
      model: 'gpt-5.1',
      api: 'openai-completions',
      temperature: 0.2,
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    },
    capabilityRefs: [IDS.webSearchInstance, IDS.webFetchInstance, IDS.datetimeInstance],
    memory: { enabled: false },
    isDefault: true,
  }

  const webSearch: CapabilityInstance = {
    id: IDS.webSearchInstance,
    capabilityId: 'web_search',
    version: '1.0.0',
    config: { provider: 'mock', count: 3 },
    secrets: {},
    permissions: [{ scope: 'network', granted: true }],
  }
  const webFetch: CapabilityInstance = {
    id: IDS.webFetchInstance,
    capabilityId: 'web_fetch',
    version: '1.0.0',
    config: {},
    secrets: {},
    permissions: [{ scope: 'network', granted: true }],
  }
  const datetime: CapabilityInstance = {
    id: IDS.datetimeInstance,
    capabilityId: 'datetime',
    version: '1.0.0',
    config: {},
    secrets: {},
    permissions: [],
  }

  const interactions: Interaction[] = [
    {
      id: IDS.sendToAgentInteraction,
      sourcePageId: IDS.homePage,
      sourceElementId: IDS.searchButton,
      trigger: 'click',
      enabled: true,
      action: {
        type: 'sendToAgent',
        agentId: IDS.agent,
        payload: { type: 'elementValue', elementId: IDS.queryInput },
        chatElementId: IDS.chatElement,
      },
    },
    {
      id: IDS.openModalInteraction,
      sourcePageId: IDS.homePage,
      sourceElementId: IDS.openModalButton,
      trigger: 'click',
      enabled: true,
      action: { type: 'openModal', targetPageId: IDS.searchModal },
    },
    {
      id: IDS.setVariableInteraction,
      sourcePageId: IDS.homePage,
      sourceElementId: IDS.queryInput,
      trigger: 'change',
      enabled: true,
      action: {
        type: 'setVariable',
        variableId: IDS.sessionVariable,
        value: { type: 'elementValue', elementId: IDS.queryInput },
      },
    },
    {
      id: IDS.navigateInteraction,
      sourcePageId: IDS.researchPage,
      sourceElementId: IDS.viewDetailsButton,
      trigger: 'click',
      enabled: true,
      action: { type: 'navigate', targetPageId: IDS.detailsPage },
    },
    {
      id: IDS.bindOutputInteraction,
      sourcePageId: IDS.researchPage,
      trigger: 'load',
      enabled: true,
      action: {
        type: 'bindOutput',
        source: { type: 'capabilityOutput', capabilityInstanceId: IDS.webSearchInstance },
        targetElementId: IDS.resultList,
        property: 'items',
      },
    },
    {
      id: IDS.backInteraction,
      sourcePageId: IDS.detailsPage,
      sourceElementId: IDS.backButton,
      trigger: 'click',
      enabled: true,
      action: { type: 'back' },
    },
    {
      id: IDS.closeModalInteraction,
      sourcePageId: IDS.searchModal,
      sourceElementId: IDS.modalSubmitButton,
      trigger: 'click',
      enabled: true,
      action: { type: 'close' },
    },
  ]

  const variables: Variable[] = [
    {
      id: IDS.sessionVariable,
      name: 'Last Query',
      scope: 'session',
      type: 'string',
      defaultValue: '',
    },
    {
      id: IDS.projectVariable,
      name: 'Research Locale',
      scope: 'project',
      type: 'string',
      defaultValue: 'en',
    },
  ]

  const bindings: DataBinding[] = [
    {
      id: IDS.inputVariableBinding,
      source: { type: 'variable', variableId: IDS.sessionVariable },
      target: { elementId: IDS.queryInput, property: 'value' },
    },
    {
      id: IDS.agentTextBinding,
      source: { type: 'agentOutput', agentId: IDS.agent },
      target: { elementId: IDS.resultCodeBlock, property: 'text' },
    },
  ]

  const assetHash = '5f1b7a9e'.padEnd(64, '0')
  const asset: Asset = {
    id: IDS.heroAsset,
    path: `assets/${assetHash.slice(0, 40)}.png`,
    mime: 'image/png',
    hash: assetHash,
    size: 1024,
    originalName: 'hero.png',
  }

  return {
    blueprintVersion: 1,
    schemaVersion: 1,
    project: { id: IDS.project, name: 'Research Assistant' },
    pages: [homePage, researchPage, detailsPage, searchModal],
    components: [],
    agents: [agent],
    capabilities: [webSearch, webFetch, datetime],
    interactions,
    bindings,
    variables,
    assets: [asset],
    settings: {
      theme: { colors: {}, fonts: {} },
      viewportPresets: [
        { name: 'desktop-1440', width: 1440, height: 1024 },
        { name: 'tablet-1024', width: 1024, height: 1366 },
        { name: 'mobile-390', width: 390, height: 844 },
      ],
      defaultAgentId: IDS.agent,
      locale: 'en',
      generator: { target: 'web-agent', dependencyOverrides: {} },
    },
  }
}
