import { describe, expect, it } from 'vitest'

import { createId } from '../src/ids'
import { validateRefs } from '../src/refs'
import type { ProjectRoot } from '../src/project'
import type { Component } from '../src/project'
import { buttonElement, emptyProject, homePage, researchAgent, textElement } from './helpers'

function connectedProject(): {
  project: ProjectRoot
  homeId: string
  buttonId: string
  modalId: string
} {
  const home = homePage()
  const modal = homePage({ id: createId(), name: 'Create Dialog', type: 'modal' })
  const button = buttonElement()
  const project = emptyProject({
    pages: [home, modal],
    interactions: [
      {
        id: createId(),
        sourcePageId: home.id,
        sourceElementId: button.id,
        trigger: 'click',
        enabled: true,
        action: { type: 'openModal', targetPageId: modal.id },
      },
    ],
  })
  project.pages[0].elements.push(button)
  return { project, homeId: home.id, buttonId: button.id, modalId: modal.id }
}

describe('validateRefs (P04.13)', () => {
  it('accepts a fully connected project', () => {
    const { project } = connectedProject()
    const report = validateRefs(project)
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('flags navigate to a missing page with a JSON path', () => {
    const missingId = createId()
    const home = homePage()
    const project = emptyProject({
      pages: [home],
      interactions: [
        {
          id: createId(),
          sourcePageId: home.id,
          trigger: 'click',
          enabled: true,
          action: { type: 'navigate', targetPageId: missingId },
        },
      ],
    })
    const report = validateRefs(project)
    expect(report.ok).toBe(false)
    expect(report.issues[0]?.code).toBe('interaction.targetPage.missing')
    expect(report.issues[0]?.path).toBe('interactions[0].action.targetPageId')
  })

  it('requires openModal/openDrawer targets to have the matching page type', () => {
    const plain = homePage()
    const drawer = homePage({ id: createId(), name: 'Side Panel', type: 'drawer' })
    const project = emptyProject({
      pages: [plain, drawer],
      interactions: [
        {
          id: createId(),
          sourcePageId: plain.id,
          trigger: 'click',
          enabled: true,
          action: { type: 'openModal', targetPageId: drawer.id },
        },
      ],
    })
    const report = validateRefs(project)
    expect(report.issues.map((i) => i.code)).toContain('interaction.targetPage.typeMismatch')
  })

  it('requires sendToAgent targets to exist', () => {
    const home = homePage({ elements: [buttonElement()] })
    const project = emptyProject({
      pages: [home],
      interactions: [
        {
          id: createId(),
          sourcePageId: home.id,
          sourceElementId: home.elements[0].id,
          trigger: 'click',
          enabled: true,
          action: {
            type: 'sendToAgent',
            agentId: createId(),
            payload: { type: 'elementValue', elementId: home.elements[0].id },
          },
        },
      ],
    })
    const report = validateRefs(project)
    expect(report.issues.map((i) => i.code)).toContain('interaction.agent.missing')
  })

  it('checks invokeCapability required args against the manifest', () => {
    const home = homePage()
    const instanceId = createId()
    const project = emptyProject({
      pages: [home],
      capabilities: [
        {
          id: instanceId,
          capabilityId: 'web_fetch',
          version: '1.0.0',
          config: {},
          secrets: {},
          permissions: [],
        },
      ],
      interactions: [
        {
          id: createId(),
          sourcePageId: home.id,
          trigger: 'click',
          enabled: true,
          action: {
            type: 'invokeCapability',
            capabilityInstanceId: instanceId,
            args: {},
          },
        },
      ],
    })
    const schemas = new Map([['web_fetch', { required: ['url'] }]])
    const report = validateRefs(project, { capabilityInputSchemas: schemas })
    expect(report.issues.map((i) => i.code)).toContain('interaction.capability.missingArg')
  })

  it('detects component reference cycles', () => {
    const a: Component = { id: createId(), name: 'Card A', description: '', elements: [] }
    const b: Component = { id: createId(), name: 'Card B', description: '', elements: [] }
    a.elements.push(textElement({ semantics: { handles: [], componentRef: b.id } }))
    b.elements.push(textElement({ semantics: { handles: [], componentRef: a.id } }))
    const project = emptyProject({ components: [a, b] })
    const report = validateRefs(project)
    expect(report.issues.map((i) => i.code)).toContain('component.referenceCycle')
  })

  it('enforces at most one default agent', () => {
    const project = emptyProject({
      agents: [
        researchAgent({ isDefault: true }),
        researchAgent({ isDefault: true, name: 'Second' }),
      ],
    })
    const report = validateRefs(project)
    expect(report.issues.map((i) => i.code)).toContain('agent.multipleDefaults')
  })

  it('flags missing assets referenced by element visuals', () => {
    const home = homePage({
      elements: [
        textElement({
          role: 'image',
          visual: {
            kind: 'image',
            geometry: { x: 0, y: 0, width: 100, height: 100 },
            style: { src: 'asset:missing.png' },
            props: {},
          },
        }),
      ],
    })
    const project = emptyProject({ pages: [home] })
    const report = validateRefs(project)
    expect(report.issues.map((i) => i.code)).toContain('element.asset.missing')
  })

  it('treats warnings as non-fatal', () => {
    const home = homePage({ elements: [buttonElement()] })
    const project = emptyProject({ pages: [home] })
    const report = validateRefs(project)
    expect(report.ok).toBe(true)
  })
})

describe('validateRefs branch coverage', () => {
  const home = () => homePage({ elements: [buttonElement(), textElement({ name: 'Chat', role: 'chat', semantics: { handles: [], agentRef: undefined } })] })

  it('close with missing target page flags', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      interactions: [{ id: createId(), sourcePageId: h.id, trigger: 'click', enabled: true, action: { type: 'close', targetPageId: createId() } }],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('interaction.targetPage.missing')
  })

  it('toggleVisibility target outside page flags', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      interactions: [{ id: createId(), sourcePageId: h.id, trigger: 'click', enabled: true, action: { type: 'toggleVisibility', targetElementId: createId() } }],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('interaction.targetElement.missing')
  })

  it('submit with missing form element flags', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      interactions: [{ id: createId(), sourcePageId: h.id, trigger: 'submit', enabled: true, action: { type: 'submit', formElementId: createId() } }],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('interaction.targetElement.missing')
  })

  it('source element missing flags', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      interactions: [{ id: createId(), sourcePageId: h.id, sourceElementId: createId(), trigger: 'click', enabled: true, action: { type: 'back' } }],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('interaction.sourceElement.missing')
  })

  it('bindOutput flags missing agent and missing target element', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      interactions: [
        {
          id: createId(),
          sourcePageId: h.id,
          trigger: 'click',
          enabled: true,
          action: {
            type: 'bindOutput',
            source: { type: 'agentOutput', agentId: createId() },
            targetElementId: createId(),
            property: 'text',
          },
        },
      ],
    })
    const codes = validateRefs(project).issues.map((i) => i.code)
    expect(codes).toContain('interaction.agent.missing')
    expect(codes).toContain('interaction.targetElement.missing')
  })

  it('bindOutput capability source missing flags', () => {
    const h = home({ elements: [textElement()] })
    const project = emptyProject({
      pages: [h],
      interactions: [
        {
          id: createId(),
          sourcePageId: h.id,
          trigger: 'load',
          enabled: true,
          action: {
            type: 'bindOutput',
            source: { type: 'capabilityOutput', capabilityInstanceId: createId() },
            targetElementId: h.elements[0].id,
            property: 'text',
          },
        },
      ],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('interaction.capability.missing')
  })

  it('sendToAgent payload variable/capability sources validated; chat element flagged when absent', () => {
    const h = home()
    const agent = researchAgent()
    const project = emptyProject({
      pages: [h],
      agents: [agent],
      variables: [{ id: createId(), name: 'v', scope: 'session', type: 'string' }],
      interactions: [
        {
          id: createId(),
          sourcePageId: h.id,
          sourceElementId: h.elements[1].id,
          trigger: 'click',
          enabled: true,
          action: {
            type: 'sendToAgent',
            agentId: agent.id,
            payload: { type: 'variable', variableId: createId() },
            chatElementId: createId(),
          },
        },
      ],
    })
    const codes = validateRefs(project).issues.map((i) => i.code)
    expect(codes).toContain('interaction.targetElement.missing')
    expect(codes).toContain('binding.variable.missing')
  })

  it('invokeCapability arg sources validated', () => {
    const h = home()
    const instance = { id: createId(), capabilityId: 'web_fetch', version: '1.0.0', config: {}, secrets: {}, permissions: [] }
    const project = emptyProject({
      pages: [h],
      capabilities: [instance],
      interactions: [
        {
          id: createId(),
          sourcePageId: h.id,
          trigger: 'click',
          enabled: true,
          action: {
            type: 'invokeCapability',
            capabilityInstanceId: instance.id,
            args: { url: { type: 'variable', variableId: createId() } },
          },
        },
      ],
    })
    expect(validateRefs(project, { capabilityInputSchemas: new Map([['web_fetch', { required: ['url'] }]]) }).issues.map((i) => i.code)).toContain('binding.variable.missing')
  })

  it('setVariable missing variable flags; literal value passes', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      interactions: [
        { id: createId(), sourcePageId: h.id, trigger: 'click', enabled: true, action: { type: 'setVariable', variableId: createId(), value: { type: 'literal', value: 'x' } } },
      ],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('interaction.variable.missing')
  })

  it('bindings validate sources and capability/agent references', () => {
    const h = home()
    const project = emptyProject({
      pages: [h],
      bindings: [
        { id: createId(), source: { type: 'agentOutput', agentId: createId() }, target: { elementId: createId(), property: 'items' } },
      ],
    })
    const codes = validateRefs(project).issues.map((i) => i.code)
    expect(codes).toContain('binding.agent.missing')
    expect(codes).toContain('binding.targetElement.missing')
  })

  it('page-scoped variable with missing page flags', () => {
    const project = emptyProject({
      variables: [{ id: createId(), name: 'rows', scope: 'page', pageId: createId(), type: 'json' }],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('variable.page.missing')
  })

  it('chat element agentRef and settings.defaultAgentId validated', () => {
    const h = homePage({
      elements: [textElement({ role: 'chat', semantics: { handles: [], agentRef: createId() } })],
    })
    const project = emptyProject({ pages: [h], settings: { ...emptyProject().settings, defaultAgentId: createId() } })
    const codes = validateRefs(project).issues.map((i) => i.code)
    expect(codes).toContain('element.agent.missing')
    expect(codes).toContain('agent.defaultMissing')
  })

  it('capabilityOutput binding with missing instance flags', () => {
    const h = home({ elements: [textElement()] })
    const project = emptyProject({
      pages: [h],
      bindings: [
        { id: createId(), source: { type: 'capabilityOutput', capabilityInstanceId: createId() }, target: { elementId: h.elements[0].id, property: 'text' } },
      ],
    })
    expect(validateRefs(project).issues.map((i) => i.code)).toContain('binding.capability.missing')
  })
})
