import { describe, expect, it } from 'vitest'

import { createId } from '../src/ids'
import { parseProject } from '../src/parse'
import {
  AgentSchema,
  CapabilityInstanceSchema,
  ElementSchema,
  InteractionSchema,
  PageSchema,
  ProjectRootSchema,
  VariableSchema,
} from '../src/project'
import { buttonElement, emptyProject, homePage, researchAgent, textElement } from './helpers'

describe('ProjectRoot schema', () => {
  it('accepts a valid project with pages, agents, capabilities, interactions', () => {
    const project = emptyProject({
      pages: [
        homePage({
          elements: [textElement(), buttonElement()],
        }),
      ],
      agents: [researchAgent()],
      capabilities: [
        {
          id: createId(),
          capabilityId: 'web_fetch',
          version: '1.0.0',
          config: { maxBytes: 100000 },
          secrets: { apiKey: '${secret:FETCH_KEY}' },
          permissions: [{ scope: 'network', granted: true }],
        },
      ],
    })
    const result = parseProject(project)
    expect(result.ok).toBe(true)
  })

  it('rejects missing required fields with machine-readable paths', () => {
    const result = parseProject({ id: 'nope' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const paths = result.issues.map((i) => i.path)
    expect(paths).toContain('schemaVersion')
    expect(paths).toContain('name')
    expect(paths).toContain('createdAt')
    expect(paths).toContain('updatedAt')
  })

  it('applies defaults for optional sections (empty project is valid)', () => {
    const project = emptyProject()
    expect(project.pages).toEqual([])
    expect(project.settings.theme.colors).toEqual({})
    expect(project.settings.generator.target).toBe('web-agent')
  })

  it('rejects non-uuid ids (array indices, names, uuid4)', () => {
    const page = homePage()
    const bad = ['page-0', 'Home', 'not-a-uuid', crypto.randomUUID()]
    for (const id of bad) {
      const result = PageSchema.safeParse({ ...page, id })
      expect(result.success).toBe(false)
    }
  })
})

describe('Element schema', () => {
  it('keeps semantics defaults and nested children', () => {
    const parent = textElement({
      role: 'group',
      children: [buttonElement()],
    })
    const result = ElementSchema.safeParse(parent)
    expect(result.success).toBe(true)
  })

  it('rejects a componentRef that is not an id', () => {
    const el = textElement({ semantics: { handles: [], componentRef: 'button-group' } })
    expect(ElementSchema.safeParse(el).success).toBe(false)
  })
})

describe('Agent schema', () => {
  it('rejects provider secrets smuggled into the model policy', () => {
    // secrets live in the secure store, never on the agent record: any
    // unknown key fails passthrough-less parsing
    const agent = researchAgent({
      modelPolicy: { provider: 'openai', model: 'gpt-5.1', apiKey: 'sk-123' } as never,
    })
    expect(AgentSchema.safeParse(agent).success).toBe(false)
  })
})

describe('CapabilityInstance schema', () => {
  it('requires secret values to be ${secret:NAME} references, never raw', () => {
    const base = { id: createId(), capabilityId: 'web_search', version: '1.0.0' }
    expect(
      CapabilityInstanceSchema.safeParse({ ...base, secrets: { apiKey: '${secret:SERPER_KEY}' } })
        .success,
    ).toBe(true)
    expect(
      CapabilityInstanceSchema.safeParse({ ...base, secrets: { apiKey: 'sk-abc123' } }).success,
    ).toBe(false)
  })

  it('rejects malformed capability ids', () => {
    const base = { id: createId(), version: '1.0.0' }
    expect(CapabilityInstanceSchema.safeParse({ ...base, capabilityId: 'Web Fetch' }).success).toBe(
      false,
    )
  })
})

describe('Interaction schema', () => {
  it('discriminates action types', () => {
    const pageId = createId()
    const agentId = createId()
    const base = { id: createId(), sourcePageId: pageId, trigger: 'click', enabled: true }
    expect(
      InteractionSchema.safeParse({
        ...base,
        action: { type: 'navigate', targetPageId: createId() },
      }).success,
    ).toBe(true)
    expect(
      InteractionSchema.safeParse({
        ...base,
        action: { type: 'sendToAgent', agentId, payload: { type: 'literal', value: 'hi' } },
      }).success,
    ).toBe(true)
    // unknown action type is rejected
    expect(InteractionSchema.safeParse({ ...base, action: { type: 'teleport' } }).success).toBe(
      false,
    )
  })
})

describe('Variable schema', () => {
  it('enforces defaultValue/type agreement', () => {
    const base = { id: createId(), name: 'query', scope: 'session' as const }
    expect(
      VariableSchema.safeParse({ ...base, type: 'string', defaultValue: 'hello' }).success,
    ).toBe(true)
    expect(
      VariableSchema.safeParse({ ...base, type: 'number', defaultValue: 'hello' }).success,
    ).toBe(false)
    expect(VariableSchema.safeParse({ ...base, type: 'boolean', defaultValue: true }).success).toBe(
      true,
    )
    expect(
      VariableSchema.safeParse({ ...base, type: 'json', defaultValue: { a: [1] } }).success,
    ).toBe(true)
  })

  it('requires pageId for page-scoped variables', () => {
    const base = { id: createId(), name: 'rows', type: 'json' as const }
    expect(VariableSchema.safeParse({ ...base, scope: 'page' }).success).toBe(false)
    expect(VariableSchema.safeParse({ ...base, scope: 'page', pageId: createId() }).success).toBe(
      true,
    )
  })
})

describe('rename/copy semantics (P04.03/P04.04)', () => {
  it('rename keeps identity; duplicate produces a new identity', () => {
    const page = homePage()
    const renamed = { ...page, name: 'Landing' }
    expect(renamed.id).toBe(page.id)
    const copy = { ...page, id: createId(), name: 'Home (copy)' }
    expect(copy.id).not.toBe(page.id)
  })
})

describe('round-trip', () => {
  it('parse(parse(project)) is identity', () => {
    const project = emptyProject({
      pages: [homePage({ elements: [buttonElement()] })],
      agents: [researchAgent()],
    })
    const first = ProjectRootSchema.parse(project)
    const second = ProjectRootSchema.parse(JSON.parse(JSON.stringify(first)))
    expect(second).toEqual(first)
  })
})
