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
