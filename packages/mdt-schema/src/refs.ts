/**
 * Reference-integrity validation (tasklist P04.13).
 *
 * Walks a parsed ProjectRoot and returns machine-readable issues with the
 * JSON path of the offending reference, so the designer can surface the
 * exact panel item and the build pipeline can lint before invoking Codex
 * (P11.22). Deleting a referenced object surfaces every dependent here.
 */
import type { Element, Page, ProjectRoot } from './project'

export type RefIssueSeverity = 'error' | 'warning'

export interface RefIssue {
  /** machine-readable code, e.g. "interaction.targetPage.missing" */
  code: string
  severity: RefIssueSeverity
  /** JSON path into the project document, e.g. `pages[0].elements[2].id` */
  path: string
  message: string
}

export interface RefReport {
  ok: boolean
  issues: RefIssue[]
}

interface PageIndex {
  page: Page
  elementIds: Set<string>
}

function indexPages(project: ProjectRoot): Map<string, PageIndex> {
  const map = new Map<string, PageIndex>()
  for (const page of project.pages) {
    const elementIds = new Set<string>()
    const visit = (el: Element) => {
      elementIds.add(el.id)
      el.children.forEach(visit)
    }
    page.elements.forEach(visit)
    map.set(page.id, { page, elementIds })
  }
  return map
}

function walkElements(page: Page, visit: (el: Element, path: string) => void): void {
  const walk = (el: Element, path: string) => {
    visit(el, path)
    el.children.forEach((c, i) => walk(c, `${path}.children[${i}]`))
  }
  page.elements.forEach((el, i) => walk(el, `elements[${i}]`))
}

/** Component reference graph cycle check returns the first cycle found. */
function findComponentCycle(project: ProjectRoot, issues: RefIssue[]): void {
  // node = component instance site (componentId), edges = nested componentRefs
  const byComponent = new Map<string, Set<string>>()
  const collect = (
    elements: Element[],
    ownerComponentId: string | null,
    pageId: string,
    path: string,
  ) => {
    elements.forEach((el, i) => {
      const p = `${path}.elements[${i}]`
      if (el.semantics.componentRef) {
        const target = el.semantics.componentRef
        if (ownerComponentId !== null) {
          if (!byComponent.has(ownerComponentId)) byComponent.set(ownerComponentId, new Set())
          byComponent.get(ownerComponentId)!.add(target)
        }
        void pageId
      }
      collect(el.children, el.semantics.componentRef ?? ownerComponentId, pageId, `${p}.children`)
    })
  }
  for (const page of project.pages)
    collect(page.elements, null, page.id, `pages[${project.pages.indexOf(page)}]`)
  for (const [ci, component] of project.components.entries()) {
    collect(component.elements, component.id, '', `components[${ci}]`)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const dfs = (node: string): boolean => {
    if (visiting.has(node)) {
      issues.push({
        code: 'component.referenceCycle',
        severity: 'error',
        path: 'components',
        message: `component reference cycle: ${[...stack.slice(stack.indexOf(node)), node].join(' -> ')}`,
      })
      return true
    }
    if (visited.has(node)) return false
    visiting.add(node)
    stack.push(node)
    for (const next of byComponent.get(node) ?? []) {
      if (dfs(next)) return true
    }
    stack.pop()
    visiting.delete(node)
    visited.add(node)
    return false
  }
  for (const component of project.components) {
    if (dfs(component.id)) return
  }
}

export interface ValidateRefsOptions {
  /**
   * Capability manifests by registry id, used to check `invokeCapability`
   * required args (P07.14). Values need only `{ inputSchema }` with a JSON
   * Schema `required` array; omitted manifests skip arg checking.
   */
  capabilityInputSchemas?: ReadonlyMap<string, { required?: readonly string[] }>
}

export function validateRefs(project: ProjectRoot, options: ValidateRefsOptions = {}): RefReport {
  const issues: RefIssue[] = []
  const pages = indexPages(project)
  const agents = new Set(project.agents.map((a) => a.id))
  const capabilityInstances = new Map(project.capabilities.map((c) => [c.id, c]))
  const variables = new Set(project.variables.map((v) => v.id))
  const assetPaths = new Set(project.assets.map((a) => a.path))
  const components = new Set(project.components.map((c) => c.id))
  const page = (id: string): PageIndex | undefined => pages.get(id)

  const checkSource = (interaction: ProjectRoot['interactions'][number], path: string): void => {
    if (!page(interaction.sourcePageId)) {
      issues.push({
        code: 'interaction.sourcePage.missing',
        severity: 'error',
        path: `${path}.sourcePageId`,
        message: `interaction references missing page ${interaction.sourcePageId}`,
      })
    } else if (interaction.sourceElementId) {
      const p = page(interaction.sourcePageId)!
      if (!p.elementIds.has(interaction.sourceElementId)) {
        issues.push({
          code: 'interaction.sourceElement.missing',
          severity: 'error',
          path: `${path}.sourceElementId`,
          message: `interaction references missing element ${interaction.sourceElementId}`,
        })
      }
    }
  }

  const checkBindingSource = (
    source: ProjectRoot['bindings'][number]['source'],
    path: string,
  ): void => {
    switch (source.type) {
      case 'elementValue':
        break // element scoping checked with the hosting interaction/page
      case 'variable':
        if (!variables.has(source.variableId)) {
          issues.push({
            code: 'binding.variable.missing',
            severity: 'error',
            path,
            message: `binding references missing variable ${source.variableId}`,
          })
        }
        break
      case 'agentOutput':
        if (!agents.has(source.agentId)) {
          issues.push({
            code: 'binding.agent.missing',
            severity: 'error',
            path,
            message: `binding references missing agent ${source.agentId}`,
          })
        }
        break
      case 'capabilityOutput':
        if (!capabilityInstances.has(source.capabilityInstanceId)) {
          issues.push({
            code: 'binding.capability.missing',
            severity: 'error',
            path,
            message: `binding references missing capability instance ${source.capabilityInstanceId}`,
          })
        }
        break
      case 'literal':
        break
    }
  }

  project.interactions.forEach((interaction, ii) => {
    const path = `interactions[${ii}]`
    checkSource(interaction, path)
    const a = interaction.action
    const actionPath = `${path}.action`
    switch (a.type) {
      case 'navigate':
      case 'openModal':
      case 'openDrawer': {
        const target = page(a.targetPageId)
        if (!target) {
          issues.push({
            code: 'interaction.targetPage.missing',
            severity: 'error',
            path: `${actionPath}.targetPageId`,
            message: `action references missing page ${a.targetPageId}`,
          })
        } else {
          const expected =
            a.type === 'navigate' ? null : a.type === 'openModal' ? 'modal' : 'drawer'
          if (expected && target.page.type !== expected) {
            issues.push({
              code: 'interaction.targetPage.typeMismatch',
              severity: 'error',
              path: `${actionPath}.targetPageId`,
              message: `${a.type} targets page "${target.page.name}" of type ${target.page.type}, expected ${expected}`,
            })
          }
        }
        break
      }
      case 'close':
        if (a.targetPageId && !page(a.targetPageId)) {
          issues.push({
            code: 'interaction.targetPage.missing',
            severity: 'error',
            path: `${actionPath}.targetPageId`,
            message: `close references missing page ${a.targetPageId}`,
          })
        }
        break
      case 'toggleVisibility':
      case 'bindOutput': {
        const targetElementId = a.targetElementId
        if (!page(interaction.sourcePageId)?.elementIds.has(targetElementId)) {
          issues.push({
            code: 'interaction.targetElement.missing',
            severity: 'error',
            path: `${actionPath}.targetElementId`,
            message: `action targets element ${targetElementId} outside the interaction's page`,
          })
        }
        if (a.type === 'bindOutput') {
          if (a.source.type === 'agentOutput' && !agents.has(a.source.agentId)) {
            issues.push({
              code: 'interaction.agent.missing',
              severity: 'error',
              path: `${actionPath}.source.agentId`,
              message: `bindOutput references missing agent ${a.source.agentId}`,
            })
          }
          if (
            a.source.type === 'capabilityOutput' &&
            !capabilityInstances.has(a.source.capabilityInstanceId)
          ) {
            issues.push({
              code: 'interaction.capability.missing',
              severity: 'error',
              path: `${actionPath}.source.capabilityInstanceId`,
              message: `bindOutput references missing capability instance ${a.source.capabilityInstanceId}`,
            })
          }
        }
        break
      }
      case 'sendToAgent': {
        if (!agents.has(a.agentId)) {
          issues.push({
            code: 'interaction.agent.missing',
            severity: 'error',
            path: `${actionPath}.agentId`,
            message: `sendToAgent references missing agent ${a.agentId}`,
          })
        }
        if (a.chatElementId && !page(interaction.sourcePageId)?.elementIds.has(a.chatElementId)) {
          issues.push({
            code: 'interaction.targetElement.missing',
            severity: 'error',
            path: `${actionPath}.chatElementId`,
            message: `sendToAgent chat element ${a.chatElementId} not on the source page`,
          })
        }
        checkBindingSource(a.payload, `${actionPath}.payload`)
        break
      }
      case 'invokeCapability': {
        const instance = capabilityInstances.get(a.capabilityInstanceId)
        if (!instance) {
          issues.push({
            code: 'interaction.capability.missing',
            severity: 'error',
            path: `${actionPath}.capabilityInstanceId`,
            message: `invokeCapability references missing capability instance ${a.capabilityInstanceId}`,
          })
        } else {
          const schema = options.capabilityInputSchemas?.get(instance.capabilityId)
          if (schema?.required) {
            for (const requiredArg of schema.required) {
              if (!(requiredArg in a.args)) {
                issues.push({
                  code: 'interaction.capability.missingArg',
                  severity: 'error',
                  path: `${actionPath}.args`,
                  message: `capability "${instance.capabilityId}" requires argument "${requiredArg}"`,
                })
              }
            }
          }
          for (const [argName, source] of Object.entries(a.args)) {
            checkBindingSource(source, `${actionPath}.args.${argName}`)
          }
        }
        break
      }
      case 'setVariable': {
        if (!variables.has(a.variableId)) {
          issues.push({
            code: 'interaction.variable.missing',
            severity: 'error',
            path: `${actionPath}.variableId`,
            message: `setVariable references missing variable ${a.variableId}`,
          })
        }
        checkBindingSource(a.value, `${actionPath}.value`)
        break
      }
      case 'submit':
        if (a.formElementId && !page(interaction.sourcePageId)?.elementIds.has(a.formElementId)) {
          issues.push({
            code: 'interaction.targetElement.missing',
            severity: 'error',
            path: `${actionPath}.formElementId`,
            message: `submit form element ${a.formElementId} not on the source page`,
          })
        }
        break
      case 'back':
        break
    }
  })

  project.bindings.forEach((binding, bi) => {
    const path = `bindings[${bi}]`
    checkBindingSource(binding.source, `${path}.source`)
    const hostPage = project.pages.find((p) =>
      pages.get(p.id)!.elementIds.has(binding.target.elementId),
    )
    if (!hostPage) {
      issues.push({
        code: 'binding.targetElement.missing',
        severity: 'error',
        path: `${path}.target.elementId`,
        message: `binding targets missing element ${binding.target.elementId}`,
      })
    }
  })

  project.variables.forEach((v, vi) => {
    if (v.pageId && !page(v.pageId)) {
      issues.push({
        code: 'variable.page.missing',
        severity: 'error',
        path: `variables[${vi}].pageId`,
        message: `variable references missing page ${v.pageId}`,
      })
    }
  })

  // element-level: component refs + asset refs
  for (const p of project.pages) {
    walkElements(p, (el, elPath) => {
      if (el.semantics.componentRef && !components.has(el.semantics.componentRef)) {
        issues.push({
          code: 'element.componentRef.missing',
          severity: 'error',
          path: `pages[${project.pages.indexOf(p)}].${elPath}.semantics.componentRef`,
          message: `element references missing component ${el.semantics.componentRef}`,
        })
      }
      for (const [key, value] of Object.entries({ ...el.visual.style, ...el.visual.props })) {
        if (typeof value === 'string' && value.startsWith('asset:')) {
          const assetPath = `assets/${value.slice('asset:'.length)}`
          if (!assetPaths.has(assetPath)) {
            issues.push({
              code: 'element.asset.missing',
              severity: 'error',
              path: `pages[${project.pages.indexOf(p)}].${elPath}.visual`,
              message: `element references missing asset ${assetPath}`,
            })
          }
        }
      }
      if (el.role === 'chat' && el.semantics.agentRef && !agents.has(el.semantics.agentRef)) {
        issues.push({
          code: 'element.agent.missing',
          severity: 'error',
          path: `pages[${project.pages.indexOf(p)}].${elPath}.semantics.agentRef`,
          message: `chat element references missing agent ${el.semantics.agentRef}`,
        })
      }
    })
  }

  findComponentCycle(project, issues)

  const defaultAgents = project.agents.filter((a) => a.isDefault)
  if (defaultAgents.length > 1) {
    issues.push({
      code: 'agent.multipleDefaults',
      severity: 'error',
      path: 'agents',
      message: `project has ${defaultAgents.length} default agents; at most one is allowed`,
    })
  }
  if (project.settings.defaultAgentId && !agents.has(project.settings.defaultAgentId)) {
    issues.push({
      code: 'agent.defaultMissing',
      severity: 'error',
      path: 'settings.defaultAgentId',
      message: `settings.defaultAgentId references missing agent ${project.settings.defaultAgentId}`,
    })
  }

  return { ok: issues.every((i) => i.severity !== 'error'), issues }
}
