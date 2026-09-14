/**
 * Pure unit tests for the interaction graph derivation + lint (P07).
 * No jsdom, no React — plain data in, assertions out.
 */
import { describe, expect, it } from 'vitest'

import { ProjectRootSchema, type ProjectRoot } from '@mdt/schema'

import { deriveGraph, describeInteraction, lintGraph, type GraphIssue } from './interaction-graph'

// Fixed UUIDv7-shaped ids (version 7, variant 10) keep tests deterministic.
const PID = {
  home: '00000000-0000-7000-8000-000000000001',
  detail: '00000000-0000-7000-8000-000000000002',
  dialog: '00000000-0000-7000-8000-000000000003',
  drawer: '00000000-0000-7000-8000-000000000004',
  c: '00000000-0000-7000-8000-000000000005',
  d: '00000000-0000-7000-8000-000000000006',
  e: '00000000-0000-7000-8000-000000000007',
} as const

const AID = {
  helper: '00000000-0000-7000-8000-000000000101',
  second: '00000000-0000-7000-8000-000000000102',
} as const

const IID = {
  nav: '00000000-0000-7000-8000-000000000201',
  modal: '00000000-0000-7000-8000-000000000202',
  agent: '00000000-0000-7000-8000-000000000203',
  load1: '00000000-0000-7000-8000-000000000204',
  load2: '00000000-0000-7000-8000-000000000205',
} as const

const EID = { chat: '00000000-0000-7000-8000-000000000301' } as const

function page(id: string, name: string, type = 'page', extra: Record<string, unknown> = {}) {
  return { id, name, type, viewport: { width: 1440, height: 1024 }, ...extra }
}

function interaction(
  id: string,
  sourcePageId: string,
  trigger: string,
  action: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return { id, sourcePageId, trigger, action, ...extra }
}

function makeProject(parts: Record<string, unknown>): ProjectRoot {
  return ProjectRootSchema.parse({
    schemaVersion: 1,
    id: '00000000-0000-7000-8000-00000000ff01',
    name: 'test-project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...parts,
  })
}

function issuesByCode(issues: GraphIssue[], code: string): GraphIssue[] {
  return issues.filter((i) => i.code === code)
}

// ---------------------------------------------------------------------------

describe('deriveGraph', () => {
  it('creates page and agent nodes with kinds, labels and counts', () => {
    const project = makeProject({
      pages: [
        page(PID.home, 'Home'),
        page(PID.dialog, 'Create Dialog', 'modal', {
          elements: [
            {
              id: EID.chat,
              name: 'Chat',
              role: 'chat',
              visual: {
                kind: 'chat',
                geometry: { x: 0, y: 0, width: 10, height: 10 },
                style: {},
                props: {},
              },
              children: [
                {
                  id: '00000000-0000-7000-8000-000000000401',
                  name: 'Inner',
                  role: 'button',
                  visual: {
                    kind: 'button',
                    geometry: { x: 0, y: 0, width: 1, height: 1 },
                    style: {},
                    props: {},
                  },
                },
              ],
            },
          ],
        }),
      ],
      agents: [
        {
          id: AID.helper,
          name: 'Helper',
          modelPolicy: { provider: 'openai', model: 'gpt-4.1-mini' },
          capabilityRefs: ['00000000-0000-7000-8000-000000000501'],
        },
      ],
      interactions: [],
    })

    const { nodes } = deriveGraph(project)
    expect(nodes).toHaveLength(3)

    const home = nodes.find((n) => n.id === PID.home)
    expect(home).toMatchObject({ kind: 'page', label: 'Home', elementCount: 0 })

    const dialog = nodes.find((n) => n.id === PID.dialog)
    expect(dialog).toMatchObject({ kind: 'modal', label: 'Create Dialog', elementCount: 2 })

    const helper = nodes.find((n) => n.id === AID.helper)
    expect(helper).toMatchObject({ kind: 'agent', label: 'Helper', capabilityCount: 1 })
  })

  it('falls back to the deterministic grid when metadata has no canvasPosition', () => {
    const pages = [
      page(PID.home, 'Home'),
      page(PID.detail, 'Detail'),
      page(PID.dialog, 'Dialog', 'modal'),
      page(PID.drawer, 'Drawer', 'drawer'),
      page(PID.c, 'C'),
      page(PID.d, 'D'),
      page(PID.e, 'E'),
    ]
    const project = makeProject({ pages, agents: [], interactions: [] })
    const { nodes } = deriveGraph(project)

    const pos = new Map(nodes.map((n) => [n.id, n.position]))
    expect(pos.get(PID.home)).toEqual({ x: 80, y: 80 }) // col 0, row 0
    expect(pos.get(PID.detail)).toEqual({ x: 80, y: 280 }) // col 0, row 1
    expect(pos.get(PID.c)).toEqual({ x: 80, y: 880 }) // col 0, row 4
    expect(pos.get(PID.d)).toEqual({ x: 360, y: 80 }) // col 1, row 0
    expect(pos.get(PID.e)).toEqual({ x: 360, y: 280 }) // col 1, row 1

    // agents sit right of the page columns (7 pages → 2 columns)
    const withAgent = makeProject({
      pages,
      agents: [
        {
          id: AID.helper,
          name: 'Helper',
          modelPolicy: { provider: 'openai', model: 'm' },
          capabilityRefs: [],
        },
        {
          id: AID.second,
          name: 'Second',
          modelPolicy: { provider: 'openai', model: 'm' },
          capabilityRefs: [],
        },
      ],
      interactions: [],
    })
    const agentNodes = deriveGraph(withAgent).nodes.filter((n) => n.kind === 'agent')
    expect(agentNodes[0]?.position).toEqual({ x: 840, y: 80 }) // 80 + 2*280 + 200
    expect(agentNodes[1]?.position).toEqual({ x: 840, y: 280 })
  })

  it('uses persisted canvasPosition from page metadata over auto-layout', () => {
    const project = makeProject({
      pages: [page(PID.home, 'Home', 'page', { metadata: { canvasPosition: { x: 500, y: 300 } } })],
      interactions: [],
    })
    const { nodes } = deriveGraph(project)
    expect(nodes[0]?.position).toEqual({ x: 500, y: 300 })
  })

  it('derives one edge per interaction with resolved targets', () => {
    const project = makeProject({
      pages: [page(PID.home, 'Home'), page(PID.dialog, 'Create Dialog', 'modal')],
      agents: [
        {
          id: AID.helper,
          name: 'Helper',
          modelPolicy: { provider: 'openai', model: 'm' },
          capabilityRefs: [],
        },
      ],
      interactions: [
        interaction(IID.nav, PID.home, 'click', { type: 'navigate', targetPageId: PID.detail }),
        interaction(IID.modal, PID.home, 'click', {
          type: 'openModal',
          targetPageId: PID.dialog,
        }),
        interaction(IID.agent, PID.home, 'submit', {
          type: 'sendToAgent',
          agentId: AID.helper,
          payload: { type: 'literal', value: '' },
        }),
        // no in-graph target → undefined (canvas renders a self-loop)
        interaction(IID.load1, PID.home, 'click', { type: 'back' }),
      ],
    })

    const { edges } = deriveGraph(project)
    expect(edges).toHaveLength(4)

    const nav = edges.find((e) => e.id === IID.nav)
    expect(nav).toMatchObject({
      source: PID.home,
      target: PID.detail,
      actionType: 'navigate',
      enabled: true,
    })
    const agent = edges.find((e) => e.id === IID.agent)
    expect(agent).toMatchObject({ source: PID.home, target: AID.helper, actionType: 'sendToAgent' })
    const back = edges.find((e) => e.id === IID.load1)
    expect(back).toMatchObject({ source: PID.home, target: undefined, actionType: 'back' })
  })

  it('renders human-readable edge labels', () => {
    const project = makeProject({
      pages: [page(PID.home, 'Home'), page(PID.dialog, 'Create Dialog', 'modal')],
      interactions: [
        interaction(IID.modal, PID.home, 'click', {
          type: 'openModal',
          targetPageId: PID.dialog,
        }),
        interaction(IID.agent, PID.home, 'dblclick', {
          type: 'sendToAgent',
          agentId: AID.helper,
          payload: { type: 'literal', value: '' },
        }),
      ],
      agents: [
        {
          id: AID.helper,
          name: 'Helper',
          modelPolicy: { provider: 'openai', model: 'm' },
          capabilityRefs: [],
        },
      ],
    })
    const { edges } = deriveGraph(project)
    expect(edges.find((e) => e.id === IID.modal)?.label).toBe('click → open modal "Create Dialog"')
    expect(edges.find((e) => e.id === IID.agent)?.label).toBe('dblclick → send to agent "Helper"')

    // full describeInteraction agrees with the edge label
    const first = project.interactions[0]
    expect(describeInteraction(project, first)).toBe(edges[0]?.label)
  })

  it('bindOutput edges point at the source agent; disabled interactions stay flagged', () => {
    const project = makeProject({
      pages: [
        page(PID.home, 'Home', 'page', {
          elements: [
            {
              id: EID.chat,
              name: 'Transcript',
              role: 'chat',
              visual: {
                kind: 'chat',
                geometry: { x: 0, y: 0, width: 10, height: 10 },
                style: {},
                props: {},
              },
            },
          ],
        }),
      ],
      agents: [
        {
          id: AID.helper,
          name: 'Helper',
          modelPolicy: { provider: 'openai', model: 'm' },
          capabilityRefs: [],
        },
      ],
      interactions: [
        interaction(IID.nav, PID.home, 'load', {
          type: 'bindOutput',
          source: { type: 'agentOutput', agentId: AID.helper },
          targetElementId: EID.chat,
          property: 'chat',
        }),
        interaction(IID.load2, PID.home, 'click', {
          type: 'navigate',
          targetPageId: PID.detail,
        }),
        {
          id: IID.load1,
          sourcePageId: PID.home,
          trigger: 'click',
          action: { type: 'back' },
          enabled: false,
        },
      ],
    })
    const { edges } = deriveGraph(project)
    expect(edges.find((e) => e.id === IID.nav)).toMatchObject({
      source: PID.home,
      target: AID.helper,
      actionType: 'bindOutput',
      label: 'load → bind agent "Helper" output to "Transcript"',
    })
    expect(edges.find((e) => e.id === IID.load1)?.enabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('lintGraph', () => {
  const base = { agents: [], interactions: [] }

  it('flags dangling page, agent and capability targets', () => {
    const missingPage = '00000000-0000-7000-8000-0000000000aa'
    const missingAgent = '00000000-0000-7000-8000-0000000000bb'
    const missingCap = '00000000-0000-7000-8000-0000000000cc'
    const project = makeProject({
      ...base,
      pages: [page(PID.home, 'Home')],
      interactions: [
        interaction(IID.nav, PID.home, 'click', { type: 'navigate', targetPageId: missingPage }),
        interaction(IID.agent, PID.home, 'click', {
          type: 'sendToAgent',
          agentId: missingAgent,
          payload: { type: 'literal', value: '' },
          chatElementId: undefined,
        }),
        interaction(IID.load1, PID.home, 'click', {
          type: 'invokeCapability',
          capabilityInstanceId: missingCap,
          args: {},
        }),
      ],
    })
    const issues = lintGraph(project)
    expect(issuesByCode(issues, 'targetPage.missing')).toHaveLength(1)
    expect(issuesByCode(issues, 'agent.missing')).toHaveLength(1)
    expect(issuesByCode(issues, 'capability.missing')).toHaveLength(1)
    // the chat-less sendToAgent also emits its (expected) warning here
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(3)
  })

  it('flags openModal/openDrawer overlay type mismatches', () => {
    const project = makeProject({
      ...base,
      pages: [
        page(PID.home, 'Home'),
        page(PID.detail, 'Detail'),
        page(PID.dialog, 'Dialog', 'modal'),
      ],
      interactions: [
        interaction(IID.nav, PID.home, 'click', { type: 'openModal', targetPageId: PID.detail }),
        interaction(IID.modal, PID.home, 'click', { type: 'openModal', targetPageId: PID.dialog }),
        interaction(IID.load1, PID.home, 'click', { type: 'openDrawer', targetPageId: PID.detail }),
      ],
    })
    const issues = lintGraph(project)
    const mismatches = issuesByCode(issues, 'targetPage.typeMismatch')
    expect(mismatches).toHaveLength(2)
    expect(mismatches.map((i) => i.interactionId).sort()).toEqual([IID.load1, IID.nav].sort())
    // targeting a real modal is fine
    expect(issuesByCode(issues, 'targetPage.missing')).toHaveLength(0)
  })

  it('detects auto-trigger loops in the load-navigate subgraph', () => {
    const cyclicPages = [page(PID.home, 'Home'), page(PID.detail, 'Detail')]
    const cyclic = makeProject({
      ...base,
      pages: cyclicPages,
      interactions: [
        interaction(IID.load1, PID.home, 'load', { type: 'navigate', targetPageId: PID.detail }),
        interaction(IID.load2, PID.detail, 'load', { type: 'navigate', targetPageId: PID.home }),
      ],
    })
    const loops = issuesByCode(lintGraph(cyclic), 'autoTrigger.loop')
    // one report per DFS back edge: the 2-cycle has exactly one
    expect(loops).toHaveLength(1)
    expect(loops[0]?.severity).toBe('error')
    expect(loops[0]?.message).toContain('auto-trigger loop')
    expect(loops[0]?.message).toContain('"Home"')
    expect(loops[0]?.message).toContain('"Detail"')
    expect(loops[0]?.message).toContain('→')

    // a self-loop is caught too
    const selfLoop = makeProject({
      ...base,
      pages: [page(PID.home, 'Home')],
      interactions: [
        interaction(IID.load1, PID.home, 'load', { type: 'navigate', targetPageId: PID.home }),
      ],
    })
    expect(issuesByCode(lintGraph(selfLoop), 'autoTrigger.loop')).toHaveLength(1)

    // linear load chains are fine, and disabled load edges do not count
    const linear = makeProject({
      ...base,
      pages: [page(PID.home, 'Home'), page(PID.detail, 'Detail'), page(PID.c, 'C')],
      interactions: [
        interaction(IID.load1, PID.home, 'load', { type: 'navigate', targetPageId: PID.detail }),
        interaction(IID.load2, PID.detail, 'load', { type: 'navigate', targetPageId: PID.c }),
      ],
    })
    expect(lintGraph(linear)).toHaveLength(0)

    const disabledCycle = makeProject({
      pages: cyclicPages,
      interactions: [
        interaction(
          IID.load1,
          PID.home,
          'load',
          { type: 'navigate', targetPageId: PID.detail },
          { enabled: false },
        ),
        interaction(
          IID.load2,
          PID.detail,
          'load',
          { type: 'navigate', targetPageId: PID.home },
          { enabled: false },
        ),
      ],
    })
    expect(lintGraph(disabledCycle)).toHaveLength(0)
  })

  it('warns when sendToAgent has no chat target on the source page', () => {
    const chatElement = {
      id: EID.chat,
      name: 'Chat',
      role: 'chat',
      visual: {
        kind: 'chat',
        geometry: { x: 0, y: 0, width: 10, height: 10 },
        style: {},
        props: {},
      },
    }
    const withAgent = {
      agents: [
        {
          id: AID.helper,
          name: 'Helper',
          modelPolicy: { provider: 'openai', model: 'm' },
          capabilityRefs: [],
        },
      ],
    }
    const noChat = makeProject({
      ...base,
      ...withAgent,
      pages: [page(PID.home, 'Home')],
      interactions: [
        interaction(IID.agent, PID.home, 'submit', {
          type: 'sendToAgent',
          agentId: AID.helper,
          payload: { type: 'literal', value: '' },
        }),
      ],
    })
    const issues = issuesByCode(lintGraph(noChat), 'sendToAgent.noChat')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('warning')

    // a chat element anywhere on the page clears the warning
    const chatOnPage = makeProject({
      ...base,
      ...withAgent,
      pages: [page(PID.home, 'Home', 'page', { elements: [chatElement] })],
      interactions: noChat.interactions,
    })
    expect(issuesByCode(lintGraph(chatOnPage), 'sendToAgent.noChat')).toHaveLength(0)

    // an explicit chatElementId clears it too
    const explicit = makeProject({
      ...base,
      ...withAgent,
      pages: [page(PID.home, 'Home')],
      interactions: [
        interaction(IID.agent, PID.home, 'submit', {
          type: 'sendToAgent',
          agentId: AID.helper,
          payload: { type: 'literal', value: '' },
          chatElementId: EID.chat,
        }),
      ],
    })
    expect(issuesByCode(lintGraph(explicit), 'sendToAgent.noChat')).toHaveLength(0)
  })

  it('flags invokeCapability calls missing required args when manifests are given', () => {
    const capInstance = {
      id: '00000000-0000-7000-8000-000000000501',
      capabilityId: 'web_fetch',
      version: '1.0.0',
    }
    const project = makeProject({
      ...base,
      pages: [page(PID.home, 'Home')],
      capabilities: [capInstance],
      interactions: [
        interaction(IID.load1, PID.home, 'click', {
          type: 'invokeCapability',
          capabilityInstanceId: capInstance.id,
          args: {},
        }),
        interaction(IID.load2, PID.home, 'click', {
          type: 'invokeCapability',
          capabilityInstanceId: capInstance.id,
          args: { url: { type: 'literal', value: 'https://example.com' } },
        }),
      ],
    })
    const manifests = new Map([['web_fetch', { inputSchema: { required: ['url'] } }]])

    const withManifests = lintGraph(project, { capabilityManifests: manifests })
    const missing = issuesByCode(withManifests, 'capability.missingArg')
    expect(missing).toHaveLength(1)
    expect(missing[0]?.interactionId).toBe(IID.load1)
    expect(missing[0]?.message).toContain('"url"')

    // without manifests, arg checking is skipped entirely
    expect(issuesByCode(lintGraph(project), 'capability.missingArg')).toHaveLength(0)
  })
})
