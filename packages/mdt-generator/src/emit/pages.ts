/**
 * Frontend codegen (P11.04–P11.08): one TSX file per MDT page (type=page →
 * route; modal/drawer/popover → overlay component rendered by its host
 * page), absolute-position layout per design geometry, `data-mdt-id` on
 * every element, interaction handlers compiled from the interactions array.
 * Output is deterministic: no timestamps, stable ordering, stable literals.
 */
import type {
  Agent,
  BuildBlueprint,
  DataBinding,
  Element,
  Interaction,
  Page,
  Variable,
} from '@mdt/schema'

import {
  pascalCase,
  slugify,
  stableJson,
  stableJsonCompact,
  tsString,
  SlugAllocator,
} from '../naming.js'

export interface OverlayPagePlan {
  page: Page
  slug: string
  componentName: string
  fileName: string
  kind: 'modal' | 'drawer' | 'popover'
}

export interface PagePlan {
  page: Page
  slug: string
  componentName: string
  fileName: string
  routePath: string
  /** overlay page ids opened from this page */
  opensOverlays: string[]
}

export interface FrontendPlan {
  pages: PagePlan[]
  overlays: OverlayPagePlan[]
  /** overlay page id → host page ids (from openModal/openDrawer interactions) */
  overlayHosts: Map<string, string[]>
  routeFile: string
  variablesFile: string
  pageFiles: { fileName: string; content: string }[]
  overlayFiles: { fileName: string; content: string }[]
}

export interface FrontendEmitInput {
  blueprint: BuildBlueprint
  plan: PagePlan | OverlayPagePlan
  overlaysOpened: string[]
  interactions: Interaction[]
  bindings: DataBinding[]
  variables: Variable[]
  agents: Agent[]
  routePaths: Map<string, string>
  overlayComponents: Map<string, { componentName: string; fileName: string }>
  warnings: string[]
}

interface AgentHook {
  agentId: string
  hookName: string
}

type OverlayKind = 'modal' | 'drawer' | 'popover'

const IND = '  '

// ---------------------------------------------------------------------------
// planning
// ---------------------------------------------------------------------------

export function planFrontend(blueprint: BuildBlueprint, warnings: string[]): FrontendPlan {
  const slugAllocator = new SlugAllocator()
  const pages = blueprint.pages.filter((page) => page.type === 'page')
  const overlayPages = blueprint.pages.filter(
    (page): page is Page & { type: 'modal' | 'drawer' | 'popover' } =>
      page.type === 'modal' || page.type === 'drawer' || page.type === 'popover',
  )
  for (const page of blueprint.pages) {
    if (page.type === 'component') {
      warnings.push(
        `page "${page.name}" (${page.id}) has type "component" — not emitted; it is a designer-side building block`,
      )
    }
  }

  const plans: PagePlan[] = pages.map((page) => {
    const slug = slugAllocator.allocate(slugify(page.name))
    const componentName = `${pascalCase(slug)}Page`
    return {
      page,
      slug,
      componentName,
      fileName: `src/pages/${componentName}.tsx`,
      routePath: '',
      opensOverlays: [],
    }
  })
  const routePaths = new Map<string, string>()
  plans.forEach((plan, index) => {
    plan.routePath = index === 0 ? '/' : `/${plan.slug}`
    routePaths.set(plan.page.id, plan.routePath)
  })

  const overlayPlans: OverlayPagePlan[] = overlayPages.map((page) => {
    const slug = slugAllocator.allocate(slugify(page.name))
    const componentName = `${pascalCase(slug)}Overlay`
    return {
      page,
      slug,
      componentName,
      fileName: `src/pages/${componentName}.tsx`,
      kind: page.type,
    }
  })
  const overlayComponents = new Map(
    overlayPlans.map((plan) => [
      plan.page.id,
      { componentName: plan.componentName, fileName: plan.fileName },
    ]),
  )

  const overlayHosts = new Map<string, string[]>()
  for (const interaction of blueprint.interactions) {
    const action = interaction.action
    if (action.type === 'openModal' || action.type === 'openDrawer') {
      const host = plans.find((plan) => plan.page.id === interaction.sourcePageId)
      if (host !== undefined && !host.opensOverlays.includes(action.targetPageId)) {
        host.opensOverlays.push(action.targetPageId)
      }
      const hosts = overlayHosts.get(action.targetPageId) ?? []
      if (!hosts.includes(interaction.sourcePageId)) hosts.push(interaction.sourcePageId)
      overlayHosts.set(action.targetPageId, hosts)
    }
  }

  const interactionsByPage = groupByPage(blueprint.interactions)
  const bindingsByPage = groupBindingsByPage(blueprint)

  const pageFiles = plans.map((plan) => ({
    fileName: plan.fileName,
    content: emitPageFile(
      {
        blueprint,
        plan,
        overlaysOpened: plan.opensOverlays,
        interactions: interactionsByPage.get(plan.page.id) ?? [],
        bindings: bindingsByPage.get(plan.page.id) ?? [],
        variables: blueprint.variables,
        agents: blueprint.agents,
        routePaths,
        overlayComponents,
        warnings,
      },
      undefined,
    ),
  }))

  const overlayFiles = overlayPlans.map((plan) => ({
    fileName: plan.fileName,
    content: emitPageFile(
      {
        blueprint,
        plan,
        overlaysOpened: [],
        interactions: interactionsByPage.get(plan.page.id) ?? [],
        bindings: bindingsByPage.get(plan.page.id) ?? [],
        variables: blueprint.variables,
        agents: blueprint.agents,
        routePaths,
        overlayComponents,
        warnings,
      },
      plan.kind,
    ),
  }))

  return {
    pages: plans,
    overlays: overlayPlans,
    overlayHosts,
    routeFile: emitRouteFile(plans),
    variablesFile: emitVariablesFile(blueprint),
    pageFiles,
    overlayFiles,
  }
}

function groupByPage(interactions: Interaction[]): Map<string, Interaction[]> {
  const map = new Map<string, Interaction[]>()
  for (const interaction of interactions) {
    if (!interaction.enabled) continue
    const list = map.get(interaction.sourcePageId) ?? []
    list.push(interaction)
    map.set(interaction.sourcePageId, list)
  }
  return map
}

function groupBindingsByPage(blueprint: BuildBlueprint): Map<string, DataBinding[]> {
  const elementPage = new Map<string, string>()
  for (const page of blueprint.pages) {
    const visit = (element: Element): void => {
      elementPage.set(element.id, page.id)
      element.children.forEach(visit)
    }
    page.elements.forEach(visit)
  }
  const map = new Map<string, DataBinding[]>()
  blueprint.bindings.forEach((binding) => {
    const pageId = elementPage.get(binding.target.elementId)
    if (pageId === undefined) return
    const list = map.get(pageId) ?? []
    list.push(binding)
    map.set(pageId, list)
  })
  return map
}

// ---------------------------------------------------------------------------
// route + variables modules
// ---------------------------------------------------------------------------

function emitRouteFile(pages: PagePlan[]): string {
  const imports = pages
    .map((plan) => `import ${plan.componentName} from './pages/${plan.componentName}'`)
    .join('\n')
  const entries = pages
    .map(
      (plan) =>
        `  { path: ${tsString(plan.routePath)}, pageId: ${tsString(plan.page.id)}, component: ${plan.componentName} },`,
    )
    .join('\n')
  return `/**
 * Generated route table (generator-owned — regenerated by @mdt/generator).
 * One route per MDT page of type "page"; the first page is the index route.
 * Modal/drawer/popover pages are overlays rendered by their host page.
 */
import type { ComponentType } from 'react'

${imports}

export interface PageRoute {
  path: string
  pageId: string
  component: ComponentType
}

export const pageRoutes: PageRoute[] = [
${entries}
]
`
}

function emitVariablesFile(blueprint: BuildBlueprint): string {
  const definitions = blueprint.variables.map((variable) => ({
    id: variable.id,
    name: variable.name,
    scope: variable.scope,
    ...(variable.pageId !== undefined ? { pageId: variable.pageId } : {}),
    type: variable.type,
    ...(variable.defaultValue !== undefined ? { defaultValue: variable.defaultValue } : {}),
  }))
  return `/**
 * Generated variable definitions (generator-owned — regenerated by
 * @mdt/generator). Importing this module registers every variable into its
 * scope store with the documented persistence semantics:
 * project/session → localStorage, page → in-memory.
 */
import { registerVariables, type VariableDefinition } from './variables'

export const generatedVariables: VariableDefinition[] = ${stableJson(definitions)}

registerVariables(generatedVariables)
`
}

// ---------------------------------------------------------------------------
// page file emission
// ---------------------------------------------------------------------------

function emitPageFile(input: FrontendEmitInput, overlayKind: OverlayKind | undefined): string {
  const { plan, page } = { ...input, page: input.plan.page }
  const isOverlay = overlayKind !== undefined

  const imports = new Set<string>([
    "import { useEffect, useState } from 'react'",
    "import { useNavigate } from 'react-router-dom'",
    "import { resolveSource } from '../bindings'",
    "import { generatedVariables } from '../generated-variables'",
    "import { storeForScope } from '../variables'",
  ])
  // the toDisplayText helper is emitted when any handler or element renders
  // non-string values (sendToAgent payloads, bound code blocks, text nodes)
  let usesDisplayText = input.interactions.some(
    (interaction) => interaction.action.type === 'sendToAgent',
  )

  const hooks = collectAgentHooks(input)
  if (hooks.length > 0) imports.add("import { useAgentRun } from '../agent-client'")
  if (input.interactions.some((interaction) => interaction.action.type === 'invokeCapability')) {
    imports.add("import { invokeCapability } from '../agent-client'")
  }

  const body: string[] = []
  body.push(
    `export default function ${plan.componentName}(${isOverlay ? `{ open, onClose }: { open: boolean; onClose: () => void }` : ''}) {`,
  )
  body.push(`${IND}const navigate = useNavigate()`)
  body.push(`${IND}const [values, setValues] = useState<Record<string, unknown>>({})`)
  body.push(`${IND}const [agentOutputs, setAgentOutputs] = useState<Record<string, string>>({})`)
  body.push(
    `${IND}const [capabilityOutputs, setCapabilityOutputs] = useState<Record<string, unknown>>({})`,
  )

  const visibilityTargets = collectVisibilityTargets(input.interactions)
  const hostPlan = isOverlay ? null : (plan as PagePlan)
  const needsOverlaysState =
    hostPlan !== null &&
    (hostPlan.opensOverlays.length > 0 ||
      input.interactions.some((interaction) => interaction.action.type === 'close'))
  if (visibilityTargets.size > 0) {
    body.push(`${IND}const [visibility, setVisibility] = useState<Record<string, boolean>>({})`)
  }
  if (needsOverlaysState) {
    body.push(`${IND}const [openOverlays, setOpenOverlays] = useState<string[]>([])`)
  }

  for (const hook of hooks) {
    body.push(`${IND}const ${hook.hookName} = useAgentRun('${hook.agentId}')`)
  }
  body.push(`${IND}const setValue = (elementId: string, value: unknown): void => {`)
  body.push(`${IND}  setValues((previous) => ({ ...previous, [elementId]: value }))`)
  body.push(`${IND}}`)
  if (needsOverlaysState) {
    body.push(`${IND}const closeOverlay = (pageId: string): void => {`)
    body.push(`${IND}  setOpenOverlays((previous) => previous.filter((id) => id !== pageId))`)
    body.push(`${IND}}`)
  }
  body.push(
    `${IND}const bindingCtx = { values, variables: generatedVariables, agentOutputs, capabilityOutputs }`,
  )

  // keep agentOutputs fresh for data bindings and bindOutput effects
  for (const hook of hooks) {
    body.push(`${IND}useEffect(() => {`)
    body.push(
      `${IND}  setAgentOutputs((previous) => ({ ...previous, '${hook.agentId}': ${hook.hookName}.lastResponse }))`,
    )
    body.push(`${IND}}, [${hook.hookName}.lastResponse])`)
  }

  // data bindings (P04.09): resolved once per render, passed to elements
  const bindingVarByBindingId = new Map<string, string>()
  const bindingVarByElement = new Map<string, string[]>()
  input.bindings.forEach((binding, index) => {
    const varName = `bound_${index}`
    bindingVarByBindingId.set(binding.id, varName)
    const existing = bindingVarByElement.get(binding.target.elementId) ?? []
    bindingVarByElement.set(binding.target.elementId, [...existing, varName])
    body.push(
      `${IND}// data binding ${binding.id}: ${binding.source.type} → element ${binding.target.elementId} (${binding.target.property})`,
    )
    body.push(
      `${IND}const ${varName} = resolveSource(${stableJsonCompact(sourceLiteral(binding.source))}, bindingCtx)`,
    )
  })

  // interaction handlers (bindOutput compiles to effects below)
  input.interactions.forEach((interaction, n) => {
    if (interaction.action.type === 'bindOutput') return
    body.push(...emitHandler(input, hooks, interaction, n, isOverlay))
  })
  for (const { n } of input.interactions
    .map((interaction, index) => ({ interaction, n: index }))
    .filter(
      ({ interaction }) =>
        interaction.trigger === 'load' && interaction.action.type !== 'bindOutput',
    )) {
    body.push(`${IND}useEffect(() => {`)
    body.push(`${IND}  void run_${n}() // trigger: load`)
    body.push(`${IND}  // eslint-disable-next-line react-hooks/exhaustive-deps`)
    body.push(`${IND}}, [])`)
  }

  // bindOutput interactions → reactive effects
  for (const interaction of input.interactions) {
    const action = interaction.action
    if (action.type !== 'bindOutput') continue
    const valueExpr =
      action.source.type === 'agentOutput'
        ? `agentOutputs['${action.source.agentId}'] ?? ''`
        : `capabilityOutputs['${action.source.capabilityInstanceId}'] ?? null`
    body.push(`${IND}useEffect(() => {`)
    body.push(
      `${IND}  // bindOutput ${interaction.id} → element ${action.targetElementId} (${action.property})`,
    )
    if (action.property === 'chat') {
      body.push(`${IND}  // chat transcripts are bound directly via the agent hook`)
    } else {
      body.push(`${IND}  setValue('${action.targetElementId}', ${valueExpr})`)
    }
    const deps = action.source.type === 'agentOutput' ? 'agentOutputs' : 'capabilityOutputs'
    body.push(`${IND}}, [${deps}])`)
  }

  // render
  const { elementLines, elementImports } = emitElementChildren(
    input,
    bindingVarByElement,
    (used) => {
      usesDisplayText = usesDisplayText || used
    },
  )
  for (const needed of elementImports) imports.add(needed)
  if (usesDisplayText) body.push(...displayTextHelper())

  if (isOverlay && overlayKind !== undefined) {
    // all hooks are declared above; overlays render nothing while closed
    body.push(`${IND}if (!open) return null`)
    body.push(`${IND}return (`)
    if (overlayKind === 'drawer') {
      const side = page.metadata.drawerSide ?? 'left'
      body.push(
        `${IND}  <div className="mdt-overlay" data-overlay-kind="drawer" data-overlay-side="${side}" data-mdt-id='${page.id}' role="dialog" aria-label=${tsString(page.name)} style={{ width: ${page.viewport.width}, height: '100vh' }}>`,
      )
    } else {
      const dismissible = overlayKind === 'modal' && page.metadata.modalDismissible !== false
      body.push(
        `${IND}  <div className="mdt-overlay-backdrop" data-overlay-kind="${overlayKind}" data-mdt-id='${page.id}'${dismissible ? ' onClick={() => onClose()}' : ''}>`,
      )
      body.push(
        `${IND}    <div className="mdt-overlay" data-overlay-kind="${overlayKind}" role="dialog" aria-modal="true" aria-label=${tsString(page.name)} style={{ width: ${page.viewport.width}, height: ${page.viewport.height} }} onClick={(event) => event.stopPropagation()}>`,
      )
    }
    body.push(...backgroundLines(page, input, 3))
    body.push(...elementLines)
    if (overlayKind === 'drawer') {
      body.push(`${IND}  </div>`)
    } else {
      body.push(`${IND}    </div>`)
      body.push(`${IND}  </div>`)
    }
  } else {
    body.push(`${IND}return (`)
    body.push(
      `${IND}  <div className="mdt-page" data-mdt-page=${tsString(page.name)} data-mdt-id='${page.id}' style={{ width: ${page.viewport.width}, height: ${page.viewport.height} }}>`,
    )
    body.push(...backgroundLines(page, input, 3))
    body.push(...elementLines)
    if (!isOverlay) {
      for (const overlayPageId of input.overlaysOpened) {
        const overlay = input.overlayComponents.get(overlayPageId)
        if (overlay === undefined) continue
        imports.add(`import ${overlay.componentName} from './${overlay.componentName}'`)
        body.push(`${IND}    <${overlay.componentName}`)
        body.push(`${IND}      open={openOverlays.includes('${overlayPageId}')}`)
        body.push(`${IND}      onClose={() => closeOverlay('${overlayPageId}')}`)
        body.push(`${IND}    />`)
      }
    }
    body.push(`${IND}  </div>`)
  }
  body.push(`${IND})`)
  body.push('}')

  const header = `/**
 * Generated by @mdt/generator — MDT ${isOverlay ? `${overlayKind} page` : 'page'} ${tsString(page.name)} (${page.id}).
 * Generator-owned: edits may be overwritten on regeneration
 * (see .mdt/generator-manifest.json).
 */
`

  return `${header}${[...imports].sort().join('\n')}\n\n${body.join('\n')}\n`
}

function backgroundLines(page: Page, input: FrontendEmitInput, depth: number): string[] {
  const color = page.background['color']
  if (typeof color !== 'string' || color === '') return []
  const safe = /^#[0-9a-fA-F]{3,8}$/.test(color) || /^(rgb|rgba|hsl)a?\(/.test(color)
  if (!safe) {
    input.warnings.push(`page ${page.id}: unsupported background value "${color}" ignored`)
    return []
  }
  const indent = IND.repeat(depth)
  return [
    `${indent}{/* page background */}`,
    `${indent}<style>{\`.mdt-page[data-mdt-id='${page.id}'], .mdt-overlay[data-mdt-id='${page.id}'] { background: ${color}; } \`}</style>`,
  ]
}

function displayTextHelper(): string[] {
  return [
    `${IND}function toDisplayText(value: unknown): string {`,
    `${IND}  if (value === null || value === undefined) return ''`,
    `${IND}  if (typeof value === 'string') return value`,
    `${IND}  return JSON.stringify(value, null, 2)`,
    `${IND}}`,
  ]
}

function collectAgentHooks(input: FrontendEmitInput): AgentHook[] {
  const hooks: AgentHook[] = []
  const seen = new Set<string>()
  const add = (agentId: string): void => {
    if (seen.has(agentId)) return
    seen.add(agentId)
    hooks.push({ agentId, hookName: `agent_${hooks.length}` })
  }
  const visit = (element: Element): void => {
    if (element.role === 'chat' && element.semantics.agentRef) add(element.semantics.agentRef)
    element.children.forEach(visit)
  }
  input.plan.page.elements.forEach(visit)
  for (const interaction of input.interactions) {
    const action = interaction.action
    if (action.type === 'sendToAgent') add(action.agentId)
    if (action.type === 'bindOutput' && action.source.type === 'agentOutput') {
      add(action.source.agentId)
    }
  }
  return hooks
}

function hookFor(input: FrontendEmitInput, agentId: string): string {
  const hooks = collectAgentHooks(input)
  return hooks.find((hook) => hook.agentId === agentId)?.hookName ?? 'agent_0'
}

function collectVisibilityTargets(interactions: Interaction[]): Set<string> {
  const targets = new Set<string>()
  for (const interaction of interactions) {
    if (interaction.action.type === 'toggleVisibility') {
      targets.add(interaction.action.targetElementId)
    }
  }
  return targets
}

function sourceLiteral(source: DataBinding['source']): Record<string, unknown> {
  return source as unknown as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// interaction handlers
// ---------------------------------------------------------------------------

function emitHandler(
  input: FrontendEmitInput,
  hooks: AgentHook[],
  interaction: Interaction,
  n: number,
  isOverlay: boolean,
): string[] {
  const action = interaction.action
  const lines: string[] = []
  lines.push(`${IND}async function run_${n}(): Promise<void> {`)
  lines.push(`${IND}  // interaction ${interaction.id} (${interaction.trigger})`)
  switch (action.type) {
    case 'navigate': {
      const target = input.routePaths.get(action.targetPageId)
      if (target !== undefined) {
        lines.push(`${IND}  navigate(${tsString(target)})`)
      } else {
        lines.push(
          `${IND}  // unknown navigation target ${action.targetPageId} (lint error upstream)`,
        )
      }
      break
    }
    case 'openModal':
    case 'openDrawer': {
      lines.push(
        `${IND}  setOpenOverlays((previous) => (previous.includes('${action.targetPageId}') ? previous : [...previous, '${action.targetPageId}']))`,
      )
      break
    }
    case 'close': {
      if (action.targetPageId !== undefined) {
        lines.push(
          `${IND}  setOpenOverlays((previous) => previous.filter((id) => id !== '${action.targetPageId}'))`,
        )
      } else if (isOverlay) {
        lines.push(`${IND}  onClose()`)
      } else {
        lines.push(`${IND}  setOpenOverlays((previous) => previous.slice(0, -1))`)
      }
      break
    }
    case 'back': {
      lines.push(`${IND}  navigate(-1)`)
      break
    }
    case 'toggleVisibility': {
      lines.push(
        `${IND}  setVisibility((previous) => ({ ...previous, '${action.targetElementId}': !(previous['${action.targetElementId}'] ?? true) }))`,
      )
      break
    }
    case 'submit': {
      lines.push(`${IND}  // 'submit' action — the owning form element performs the submission`)
      break
    }
    case 'sendToAgent': {
      const hook = hooks.find((candidate) => candidate.agentId === action.agentId)
      const hookName = hook?.hookName ?? 'agent_0'
      lines.push(
        `${IND}  ${hookName}.send(toDisplayText(resolveSource(${stableJsonCompact(sourceLiteral(action.payload))}, bindingCtx)))`,
      )
      break
    }
    case 'invokeCapability': {
      const argEntries = Object.entries(action.args).map(
        ([name, source]) =>
          `${tsString(name)}: resolveSource(${stableJsonCompact(sourceLiteral(source))}, bindingCtx)`,
      )
      const instance = input.blueprint.capabilities.find(
        (candidate) => candidate.id === action.capabilityInstanceId,
      )
      const capabilityLabel = instance?.capabilityId ?? action.capabilityInstanceId
      lines.push(`${IND}  try {`)
      lines.push(
        `${IND}    const result = await invokeCapability('${action.capabilityInstanceId}', { ${argEntries.join(', ')} })`,
      )
      lines.push(
        `${IND}    setCapabilityOutputs((previous) => ({ ...previous, '${action.capabilityInstanceId}': result }))`,
      )
      if (action.resultElementId !== undefined) {
        lines.push(`${IND}    setValue('${action.resultElementId}', result)`)
      }
      lines.push(`${IND}  } catch (error) {`)
      lines.push(
        `${IND}    console.error('capability ${capabilityLabel} failed', error) // eslint-disable-line no-console`,
      )
      lines.push(`${IND}  }`)
      break
    }
    case 'setVariable': {
      const variable = input.variables.find((candidate) => candidate.id === action.variableId)
      if (variable === undefined) {
        lines.push(`${IND}  // unknown variable ${action.variableId} (lint error upstream)`)
      } else {
        lines.push(
          `${IND}  storeForScope('${variable.scope}').set('${action.variableId}', resolveSource(${stableJsonCompact(sourceLiteral(action.value))}, bindingCtx))`,
        )
      }
      break
    }
    case 'bindOutput':
      break
    default:
      break
  }
  lines.push(`${IND}}`)
  return lines
}

// ---------------------------------------------------------------------------
// element rendering
// ---------------------------------------------------------------------------

interface ElementEmit {
  lines: string[]
  imports: Set<string>
  usesDisplayText: boolean
}

function emitElementChildren(
  input: FrontendEmitInput,
  bindingVarByElement: Map<string, string[]>,
  onDisplayText: (used: boolean) => void,
): { elementLines: string[]; elementImports: Set<string> } {
  const lines: string[] = []
  const imports = new Set<string>()
  const visit = (element: Element, depth: number): void => {
    if (element.hidden) {
      lines.push(
        `${IND.repeat(depth)}{/* element "${element.name}" (${element.id}) is hidden in the design — not rendered */}`,
      )
      return
    }
    const emitted = emitElement(input, element, depth, bindingVarByElement)
    lines.push(...emitted.lines)
    for (const needed of emitted.imports) imports.add(needed)
    onDisplayText(emitted.usesDisplayText)
    const isContainer =
      element.role === 'group' ||
      element.role === 'form' ||
      element.role === 'component' ||
      element.role === 'custom'
    if (element.children.length > 0 && isContainer) {
      element.children.forEach((child) => visit(child, depth + 1))
      lines.push(...closeContainer(element, depth))
    } else if (element.children.length > 0) {
      // non-container roles render children as siblings (absolute layout is
      // coordinate-based, so nesting is purely semantic — P06.13)
      element.children.forEach((child) => visit(child, depth + 1))
    }
  }
  input.plan.page.elements.forEach((element) => visit(element, 3))
  return { elementLines: lines, elementImports: imports }
}

function closeContainer(element: Element, depth: number): string[] {
  const indent = IND.repeat(depth)
  return [element.role === 'form' ? `${indent}</form>` : `${indent}</div>`]
}

function wireTrigger(
  input: FrontendEmitInput,
  element: Element,
  trigger: Interaction['trigger'],
  depth: number,
): string[] {
  const lines: string[] = []
  const attr = trigger === 'dblclick' ? 'onDoubleClick' : 'onClick'
  input.interactions.forEach((interaction, n) => {
    if (interaction.trigger !== trigger || interaction.sourceElementId !== element.id) return
    if (trigger === 'change') return // wired into onChange
    lines.push(`${IND.repeat(depth)}  ${attr}={() => void run_${n}()}`)
  })
  return lines
}

function wireChange(
  input: FrontendEmitInput,
  element: Element,
  depth: number,
  valueArg: string,
): string[] {
  const indent = IND.repeat(depth)
  const changeRuns: number[] = []
  input.interactions.forEach((interaction, n) => {
    if (interaction.trigger === 'change' && interaction.sourceElementId === element.id) {
      changeRuns.push(n)
    }
  })
  if (changeRuns.length === 0) {
    return [`${indent}  onChange={(${valueArg}) => setValue('${element.id}', ${valueArg})}`]
  }
  return [
    `${indent}  onChange={(${valueArg}) => {`,
    `${indent}    setValue('${element.id}', ${valueArg})`,
    ...changeRuns.map((n) => `${indent}    void run_${n}()`),
    `${indent}  }}`,
  ]
}

function emitElement(
  input: FrontendEmitInput,
  element: Element,
  depth: number,
  bindingVarByElement: Map<string, string[]>,
): ElementEmit {
  const indent = IND.repeat(depth)
  const bound = bindingVarByElement.get(element.id) ?? []
  const lines: string[] = []
  const imports = new Set<string>()
  let usesDisplayText = false

  const visibilityTargets = collectVisibilityTargets(input.interactions)
  const classNameExpr = visibilityTargets.has(element.id)
    ? `visibility['${element.id}'] === false ? 'mdt-hidden' : undefined`
    : undefined

  const baseProps = (): string[] => {
    const props: string[] = []
    props.push(`${indent}  mdtId='${element.id}'`)
    props.push(`${indent}  geometry={${stableJsonCompact(element.visual.geometry)}}`)
    const styleKeys = Object.keys(element.visual.style)
    if (styleKeys.length > 0) {
      props.push(`${indent}  style={${stableJsonCompact(element.visual.style)}}`)
    }
    if (classNameExpr !== undefined) {
      props.push(`${indent}  className={${classNameExpr}}`)
    }
    return props
  }
  const label = element.semantics.accessibility?.label ?? element.semantics.label
  const rawStyle = element.visual.style
  const plainStyle = (): string[] => {
    const props: string[] = []
    props.push(`${indent}  data-mdt-id='${element.id}'`)
    props.push(
      `${indent}  style={mdtElementStyle(${stableJsonCompact(element.visual.geometry)}, ${stableJsonCompact(rawStyle)})}`,
    )
    if (classNameExpr !== undefined) {
      props.push(`${indent}  className={${classNameExpr}}`)
    }
    return props
  }

  switch (element.role) {
    case 'button': {
      imports.add("import { MdtButton } from '../elements/MdtButton'")
      const buttonLabel = String(element.visual.props.label ?? label ?? element.name)
      lines.push(`${indent}<MdtButton`, ...baseProps())
      lines.push(`${indent}  label=${tsString(buttonLabel)}`)
      lines.push(...wireTrigger(input, element, 'click', depth))
      lines.push(...wireTrigger(input, element, 'dblclick', depth))
      lines.push(`${indent}/>`)
      break
    }
    case 'input': {
      imports.add("import { MdtInput } from '../elements/MdtInput'")
      lines.push(`${indent}<MdtInput`, ...baseProps())
      lines.push(
        `${indent}  value={String(values['${element.id}'] ?? ${stableJsonCompact(element.semantics.defaultValue ?? '')})}`,
      )
      const placeholder =
        element.semantics.placeholder ?? asOptionalString(element.visual.props.placeholder)
      if (placeholder !== undefined) lines.push(`${indent}  placeholder=${tsString(placeholder)}`)
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(...wireChange(input, element, depth, 'value'))
      lines.push(`${indent}/>`)
      break
    }
    case 'textarea': {
      imports.add("import { MdtTextarea } from '../elements/MdtTextarea'")
      lines.push(`${indent}<MdtTextarea`, ...baseProps())
      lines.push(
        `${indent}  value={String(values['${element.id}'] ?? ${stableJsonCompact(element.semantics.defaultValue ?? '')})}`,
      )
      const placeholder =
        element.semantics.placeholder ?? asOptionalString(element.visual.props.placeholder)
      if (placeholder !== undefined) lines.push(`${indent}  placeholder=${tsString(placeholder)}`)
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(...wireChange(input, element, depth, 'value'))
      lines.push(`${indent}/>`)
      break
    }
    case 'checkbox': {
      imports.add("import { MdtCheckbox } from '../elements/MdtCheckbox'")
      lines.push(`${indent}<MdtCheckbox`, ...baseProps())
      lines.push(`${indent}  checked={values['${element.id}'] === true}`)
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(...wireChange(input, element, depth, 'checked'))
      lines.push(`${indent}/>`)
      break
    }
    case 'select': {
      imports.add("import { MdtSelect } from '../elements/MdtSelect'")
      const options = element.semantics.options ?? []
      lines.push(`${indent}<MdtSelect`, ...baseProps())
      lines.push(
        `${indent}  value={String(values['${element.id}'] ?? ${stableJsonCompact(element.semantics.defaultValue ?? options[0] ?? '')})}`,
      )
      lines.push(`${indent}  options={${stableJsonCompact(options)}}`)
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(...wireChange(input, element, depth, 'value'))
      lines.push(`${indent}/>`)
      break
    }
    case 'tabs': {
      imports.add("import { MdtTabs } from '../elements/MdtTabs'")
      const options = element.semantics.options ?? []
      lines.push(`${indent}<MdtTabs`, ...baseProps())
      lines.push(`${indent}  options={${stableJsonCompact(options)}}`)
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(...wireChange(input, element, depth, 'value'))
      lines.push(`${indent}/>`)
      break
    }
    case 'list': {
      imports.add("import { MdtList } from '../elements/MdtList'")
      lines.push(`${indent}<MdtList`, ...baseProps())
      lines.push(
        bound.length > 0
          ? `${indent}  items={toArray(${bound[0]})}`
          : `${indent}  items={${stableJsonCompact(element.visual.props.items ?? [])}}`,
      )
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(...wireTrigger(input, element, 'click', depth))
      lines.push(`${indent}/>`)
      imports.add("import { toArray } from '../bindings'")
      break
    }
    case 'datatable': {
      imports.add("import { MdtDataTable } from '../elements/MdtDataTable'")
      const columns = element.visual.props.columns ?? []
      lines.push(`${indent}<MdtDataTable`, ...baseProps())
      lines.push(`${indent}  columns={toArrayRecords(${stableJsonCompact(columns)})}`)
      lines.push(
        bound.length > 0
          ? `${indent}  rows={toArrayRecords(${bound[0]})}`
          : `${indent}  rows={toArrayRecords(${stableJsonCompact(element.visual.props.rows ?? [])})}`,
      )
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(`${indent}/>`)
      imports.add("import { toArrayRecords } from '../bindings'")
      break
    }
    case 'chat': {
      imports.add("import { MdtChat } from '../elements/MdtChat'")
      const agentRef = element.semantics.agentRef
      lines.push(`${indent}<MdtChat`, ...baseProps())
      if (agentRef !== undefined) {
        const hook = hookFor(input, agentRef)
        lines.push(`${indent}  messages={${hook}.messages}`)
        lines.push(`${indent}  running={${hook}.running}`)
        lines.push(`${indent}  onSend={${hook}.send}`)
        lines.push(`${indent}  onCancel={${hook}.cancel}`)
      }
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      const placeholder =
        element.semantics.placeholder ?? asOptionalString(element.visual.props.placeholder)
      if (placeholder !== undefined) lines.push(`${indent}  placeholder=${tsString(placeholder)}`)
      lines.push(`${indent}/>`)
      break
    }
    case 'filepicker': {
      imports.add("import { MdtFilePicker } from '../elements/MdtFilePicker'")
      lines.push(`${indent}<MdtFilePicker`, ...baseProps())
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      if (element.semantics.accept !== undefined) {
        lines.push(`${indent}  accept=${tsString(element.semantics.accept)}`)
      }
      if (element.semantics.multiple === true) lines.push(`${indent}  multiple`)
      lines.push(`${indent}  onPick={(files) => setValue('${element.id}', files)}`)
      lines.push(`${indent}/>`)
      break
    }
    case 'codeblock': {
      imports.add("import { MdtCodeBlock } from '../elements/MdtCodeBlock'")
      lines.push(`${indent}<MdtCodeBlock`, ...baseProps())
      lines.push(
        bound.length > 0
          ? `${indent}  text={toDisplayText(${bound[0]})}`
          : `${indent}  text=${tsString(String(element.visual.props.text ?? ''))}`,
      )
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(`${indent}/>`)
      if (bound.length > 0) usesDisplayText = true
      break
    }
    case 'browserframe': {
      imports.add("import { MdtBrowserFrame } from '../elements/MdtBrowserFrame'")
      lines.push(`${indent}<MdtBrowserFrame`, ...baseProps())
      const url = element.semantics.url ?? asOptionalString(element.visual.props.url)
      if (url !== undefined) lines.push(`${indent}  url=${tsString(url)}`)
      if (label !== undefined) lines.push(`${indent}  label=${tsString(label)}`)
      lines.push(`${indent}/>`)
      break
    }
    case 'image': {
      lines.push(`${indent}<img`, ...plainStyle())
      lines.push(`${indent}  src=${tsString(resolveImageSrc(element, input))}`)
      lines.push(`${indent}  alt=${tsString(label ?? element.name)}`)
      lines.push(`${indent}/>`)
      imports.add("import { mdtElementStyle } from '../elements/layout'")
      break
    }
    case 'icon': {
      lines.push(`${indent}<span`, ...plainStyle(), `${indent}>`)
      lines.push(`${indent}  {${tsString(String(element.visual.props.glyph ?? '◆'))}}`)
      lines.push(`${indent}</span>`)
      imports.add("import { mdtElementStyle } from '../elements/layout'")
      break
    }
    case 'shape': {
      lines.push(`${indent}<div`, ...plainStyle(), `${indent}/>`)
      imports.add("import { mdtElementStyle } from '../elements/layout'")
      break
    }
    case 'text': {
      lines.push(`${indent}<div`, ...plainStyle(), `${indent}>`)
      lines.push(
        bound.length > 0
          ? `${indent}  {toDisplayText(${bound[0]})}`
          : `${indent}  {${tsString(String(element.visual.props.text ?? ''))}}`,
      )
      lines.push(`${indent}</div>`)
      imports.add("import { mdtElementStyle } from '../elements/layout'")
      if (bound.length > 0) usesDisplayText = true
      break
    }
    case 'form': {
      lines.push(`${indent}<form`, ...plainStyle())
      const submitRuns: number[] = []
      input.interactions.forEach((interaction, n) => {
        if (interaction.trigger === 'submit' && interaction.sourceElementId === element.id) {
          submitRuns.push(n)
        }
      })
      lines.push(`${indent}  onSubmit={(event) => {`)
      lines.push(`${indent}    event.preventDefault()`)
      for (const n of submitRuns) lines.push(`${indent}    void run_${n}()`)
      lines.push(`${indent}  }}`)
      lines.push(`${indent}>`)
      imports.add("import { mdtElementStyle } from '../elements/layout'")
      break
    }
    case 'group':
    case 'component':
    case 'custom':
    default: {
      lines.push(`${indent}<div`, ...plainStyle(), `${indent}>`)
      if (element.visual.props.text !== undefined) {
        lines.push(`${indent}  {${tsString(String(element.visual.props.text))}}`)
      }
      imports.add("import { mdtElementStyle } from '../elements/layout'")
      break
    }
  }
  return { lines, imports, usesDisplayText }
}

function resolveImageSrc(element: Element, input: FrontendEmitInput): string {
  const raw = element.visual.props.src
  if (typeof raw === 'string') {
    if (raw.startsWith('asset:')) return `/assets/${raw.slice('asset:'.length)}`
    return raw
  }
  input.warnings.push(
    `image element "${element.name}" (${element.id}) has no src prop — rendering empty`,
  )
  return ''
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export { pascalCase, slugify }
