/**
 * Interaction graph derivation + lint (tasklist P07.01–P07.03).
 *
 * Pure logic shared by the Interaction Canvas: turns a ProjectRoot into the
 * node/edge view model the canvas renders, and lints the interaction graph
 * for graph-specific problems that `validateRefs` does not express (overlay
 * type mismatches, `load`-trigger cycles, chat-less `sendToAgent`, missing
 * capability arguments).
 *
 * This module must stay free of React/DOM/app imports so it can be unit
 * tested without jsdom and reused by tooling.
 */
import type {
  Element,
  Interaction,
  InteractionAction,
  Page,
  PageType,
  ProjectRoot,
  Trigger,
} from '@mdt/schema'

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type GraphNodeKind = PageType | 'agent'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  position: { x: number; y: number }
  /** total element count including group children (page nodes only) */
  elementCount?: number
  /** assigned capability instance count (agent nodes only) */
  capabilityCount?: number
}

export interface GraphEdge {
  /** the interaction id — edges are 1:1 with interactions */
  id: string
  source: string
  /**
   * Action target node id. `undefined` for actions that act inside the
   * source page (close/back/toggleVisibility/submit/setVariable); the
   * canvas renders those as self-loops.
   */
  target: string | undefined
  /** human-readable edge label, e.g. `click → open modal "Create Dialog"` */
  label: string
  actionType: InteractionAction['type']
  enabled: boolean
}

export interface InteractionGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ---------------------------------------------------------------------------
// Deterministic auto-layout (P07.04 fallback)
// ---------------------------------------------------------------------------

/** rows per auto-layout column — keeps the fallback grid roughly square-ish */
const AUTO_LAYOUT_ROWS_PER_COLUMN = 5
const AUTO_LAYOUT_ORIGIN_X = 80
const AUTO_LAYOUT_ORIGIN_Y = 80
const AUTO_LAYOUT_COL_WIDTH = 280
const AUTO_LAYOUT_ROW_HEIGHT = 200
/** gap between the last page column and the agent column */
const AGENT_COLUMN_GAP = 200

function pageAutoPosition(index: number): { x: number; y: number } {
  const col = Math.floor(index / AUTO_LAYOUT_ROWS_PER_COLUMN)
  const row = index % AUTO_LAYOUT_ROWS_PER_COLUMN
  return {
    x: AUTO_LAYOUT_ORIGIN_X + col * AUTO_LAYOUT_COL_WIDTH,
    y: AUTO_LAYOUT_ORIGIN_Y + row * AUTO_LAYOUT_ROW_HEIGHT,
  }
}

// ---------------------------------------------------------------------------
// Graph derivation
// ---------------------------------------------------------------------------

/** Recursive element count (group children included). */
export function countElements(elements: Element[]): number {
  let n = 0
  for (const el of elements) {
    n += 1 + countElements(el.children)
  }
  return n
}

/**
 * Derive the canvas view model: one node per page (kind from page type,
 * position from `metadata.canvasPosition` or the deterministic grid) and one
 * per agent (placed right of the page columns), plus one edge per
 * interaction. Pure — the same project always yields the same graph.
 */
export function deriveGraph(project: ProjectRoot): InteractionGraph {
  const nodes: GraphNode[] = project.pages.map((page, i) => ({
    id: page.id,
    kind: page.type,
    label: page.name,
    position: page.metadata.canvasPosition ?? pageAutoPosition(i),
    elementCount: countElements(page.elements),
  }))

  const pageColumns = Math.ceil(project.pages.length / AUTO_LAYOUT_ROWS_PER_COLUMN)
  const agentX = AUTO_LAYOUT_ORIGIN_X + pageColumns * AUTO_LAYOUT_COL_WIDTH + AGENT_COLUMN_GAP
  for (const [i, agent] of project.agents.entries()) {
    nodes.push({
      id: agent.id,
      kind: 'agent',
      label: agent.name,
      position: { x: agentX, y: AUTO_LAYOUT_ORIGIN_Y + i * AUTO_LAYOUT_ROW_HEIGHT },
      capabilityCount: agent.capabilityRefs.length,
    })
  }

  const edges = project.interactions.map((interaction) => {
    const source = interaction.sourcePageId
    const target = actionTarget(interaction)
    return {
      id: interaction.id,
      source,
      target,
      label: describeInteraction(project, interaction),
      actionType: interaction.action.type,
      enabled: interaction.enabled,
    }
  })

  return { nodes, edges }
}

/** Node id an interaction's action points at, if it has one in the graph. */
function actionTarget(interaction: Interaction): string | undefined {
  const a = interaction.action
  switch (a.type) {
    case 'navigate':
    case 'openModal':
    case 'openDrawer':
      return a.targetPageId
    case 'close':
      return a.targetPageId
    case 'sendToAgent':
      return a.agentId
    case 'invokeCapability':
      return a.capabilityInstanceId
    case 'bindOutput':
      return a.source.type === 'agentOutput' ? a.source.agentId : a.source.capabilityInstanceId
    case 'back':
    case 'toggleVisibility':
    case 'submit':
    case 'setVariable':
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Human-readable descriptions
// ---------------------------------------------------------------------------

function findElementName(project: ProjectRoot, elementId: string): string | undefined {
  const find = (el: Element): string | undefined => {
    if (el.id === elementId) return el.name
    for (const child of el.children) {
      const found = find(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const page of project.pages) {
    for (const el of page.elements) {
      const name = find(el)
      if (name !== undefined) return name
    }
  }
  return undefined
}

function findPageName(project: ProjectRoot, pageId: string): string | undefined {
  return project.pages.find((p) => p.id === pageId)?.name
}

function findAgentName(project: ProjectRoot, agentId: string): string | undefined {
  return project.agents.find((a) => a.id === agentId)?.name
}

function findCapabilityId(project: ProjectRoot, instanceId: string): string | undefined {
  return project.capabilities.find((c) => c.id === instanceId)?.capabilityId
}

function findVariableName(project: ProjectRoot, variableId: string): string | undefined {
  return project.variables.find((v) => v.id === variableId)?.name
}

function orMissing(name: string | undefined): string {
  return name ?? '(missing)'
}

/** Human string for one action, e.g. `open modal "Create Dialog"`. */
export function describeAction(project: ProjectRoot, action: InteractionAction): string {
  switch (action.type) {
    case 'navigate':
      return `navigate to "${orMissing(findPageName(project, action.targetPageId))}"`
    case 'openModal':
      return `open modal "${orMissing(findPageName(project, action.targetPageId))}"`
    case 'openDrawer':
      return `open drawer "${orMissing(findPageName(project, action.targetPageId))}"`
    case 'close':
      return action.targetPageId
        ? `close "${orMissing(findPageName(project, action.targetPageId))}"`
        : 'close overlay'
    case 'back':
      return 'go back'
    case 'toggleVisibility':
      return `toggle "${orMissing(findElementName(project, action.targetElementId))}"`
    case 'submit':
      return action.formElementId
        ? `submit "${orMissing(findElementName(project, action.formElementId))}"`
        : 'submit form'
    case 'sendToAgent':
      return `send to agent "${orMissing(findAgentName(project, action.agentId))}"`
    case 'invokeCapability':
      return `invoke capability "${orMissing(findCapabilityId(project, action.capabilityInstanceId))}"`
    case 'setVariable':
      return `set variable "${orMissing(findVariableName(project, action.variableId))}"`
    case 'bindOutput': {
      const sourceName =
        action.source.type === 'agentOutput'
          ? orMissing(findAgentName(project, action.source.agentId))
          : orMissing(findCapabilityId(project, action.source.capabilityInstanceId))
      const sourceKind = action.source.type === 'agentOutput' ? 'agent' : 'capability'
      return `bind ${sourceKind} "${sourceName}" output to "${orMissing(
        findElementName(project, action.targetElementId),
      )}"`
    }
  }
}

/** Full edge label: trigger + action, e.g. `click → open modal "Dialog"`. */
export function describeInteraction(project: ProjectRoot, interaction: Interaction): string {
  return `${interaction.trigger} → ${describeAction(project, interaction.action)}`
}

// ---------------------------------------------------------------------------
// Lint (graph-specific, complements validateRefs)
// ---------------------------------------------------------------------------

export interface GraphIssue {
  severity: 'error' | 'warning'
  /** machine-readable code, e.g. "targetPage.missing" */
  code: string
  message: string
  /** offending interaction, when the issue is interaction-scoped */
  interactionId?: string
}

export interface LintGraphOptions {
  /**
   * Capability manifests by registry id; used to check `invokeCapability`
   * required args. Only `{ inputSchema }` with a JSON Schema `required`
   * array is needed. Omitted manifests skip arg checking.
   */
  capabilityManifests?: ReadonlyMap<string, { inputSchema?: { required?: readonly string[] } }>
}

/**
 * Lint the interaction graph. Covers: dangling page/agent/capability
 * targets, `openModal`/`openDrawer` overlay-type mismatches, `load`-trigger
 * navigation cycles ("auto-trigger loop"), `sendToAgent` without any chat
 * target (warning), and `invokeCapability` calls missing required
 * arguments. Pure and independent of `validateRefs`.
 */
export function lintGraph(project: ProjectRoot, options: LintGraphOptions = {}): GraphIssue[] {
  const issues: GraphIssue[] = []
  const pages = new Map<string, Page>(project.pages.map((p) => [p.id, p]))
  const agents = new Set(project.agents.map((a) => a.id))
  const capabilities = new Map(project.capabilities.map((c) => [c.id, c]))

  for (const interaction of project.interactions) {
    const a = interaction.action
    switch (a.type) {
      case 'navigate':
      case 'openModal':
      case 'openDrawer': {
        const target = pages.get(a.targetPageId)
        if (!target) {
          issues.push({
            severity: 'error',
            code: 'targetPage.missing',
            message: `${a.type} targets missing page ${a.targetPageId}`,
            interactionId: interaction.id,
          })
        } else if (a.type === 'openModal' && target.type !== 'modal') {
          issues.push({
            severity: 'error',
            code: 'targetPage.typeMismatch',
            message: `open modal targets "${target.name}" of type ${target.type}, expected modal`,
            interactionId: interaction.id,
          })
        } else if (a.type === 'openDrawer' && target.type !== 'drawer') {
          issues.push({
            severity: 'error',
            code: 'targetPage.typeMismatch',
            message: `open drawer targets "${target.name}" of type ${target.type}, expected drawer`,
            interactionId: interaction.id,
          })
        }
        break
      }
      case 'close':
        if (a.targetPageId && !pages.has(a.targetPageId)) {
          issues.push({
            severity: 'error',
            code: 'targetPage.missing',
            message: `close references missing page ${a.targetPageId}`,
            interactionId: interaction.id,
          })
        }
        break
      case 'sendToAgent': {
        if (!agents.has(a.agentId)) {
          issues.push({
            severity: 'error',
            code: 'agent.missing',
            message: `sendToAgent references missing agent ${a.agentId}`,
            interactionId: interaction.id,
          })
        }
        const sourcePage = pages.get(interaction.sourcePageId)
        const hasChatOnPage =
          sourcePage !== undefined && pageHasRole(sourcePage.elements, 'chat') === true
        if (!a.chatElementId && !hasChatOnPage) {
          issues.push({
            severity: 'warning',
            code: 'sendToAgent.noChat',
            message: `sendToAgent on "${orMissing(sourcePage?.name)}" has no chat target — add a chat element to the page or set chatElementId`,
            interactionId: interaction.id,
          })
        }
        break
      }
      case 'invokeCapability': {
        const instance = capabilities.get(a.capabilityInstanceId)
        if (!instance) {
          issues.push({
            severity: 'error',
            code: 'capability.missing',
            message: `invokeCapability references missing capability instance ${a.capabilityInstanceId}`,
            interactionId: interaction.id,
          })
          break
        }
        const schema = options.capabilityManifests?.get(instance.capabilityId)?.inputSchema
        for (const requiredArg of schema?.required ?? []) {
          if (!(requiredArg in a.args)) {
            issues.push({
              severity: 'error',
              code: 'capability.missingArg',
              message: `capability "${instance.capabilityId}" requires argument "${requiredArg}"`,
              interactionId: interaction.id,
            })
          }
        }
        break
      }
      case 'bindOutput': {
        const sourceOk =
          a.source.type === 'agentOutput'
            ? agents.has(a.source.agentId)
            : capabilities.has(a.source.capabilityInstanceId)
        if (!sourceOk) {
          issues.push({
            severity: 'error',
            code: a.source.type === 'agentOutput' ? 'agent.missing' : 'capability.missing',
            message:
              a.source.type === 'agentOutput'
                ? `bindOutput references missing agent ${a.source.agentId}`
                : `bindOutput references missing capability instance ${a.source.capabilityInstanceId}`,
            interactionId: interaction.id,
          })
        }
        break
      }
      case 'back':
      case 'toggleVisibility':
      case 'submit':
      case 'setVariable':
        break
    }
  }

  detectLoadCycles(project, issues)

  return issues
}

function pageHasRole(elements: Element[], role: Element['role']): boolean {
  return elements.some((el) => el.role === role || pageHasRole(el.children, role))
}

/**
 * Detect cycles in the `load`-trigger navigation subgraph ("auto-trigger
 * loop"): pages that load-navigate to each other would loop forever at
 * runtime. Disabled interactions are excluded — they do not fire. Each
 * back edge found is reported once, deterministically.
 */
function detectLoadCycles(project: ProjectRoot, issues: GraphIssue[]): void {
  // adjacency: source page id → load-navigate edges
  const edges = new Map<string, { target: string; interaction: Interaction }[]>()
  for (const interaction of project.interactions) {
    if (!interaction.enabled || interaction.trigger !== 'load') continue
    if (interaction.action.type !== 'navigate') continue
    const list = edges.get(interaction.sourcePageId) ?? []
    list.push({ target: interaction.action.targetPageId, interaction })
    edges.set(interaction.sourcePageId, list)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  const dfs = (pageId: string): void => {
    visiting.add(pageId)
    stack.push(pageId)
    for (const edge of edges.get(pageId) ?? []) {
      if (visiting.has(edge.target)) {
        const cycleStart = stack.indexOf(edge.target)
        const cycle = [...stack.slice(cycleStart), edge.target]
        issues.push({
          severity: 'error',
          code: 'autoTrigger.loop',
          message: `auto-trigger loop: ${cycle
            .map((id) => `"${orMissing(findPageName(project, id))}"`)
            .join(' → ')}`,
          interactionId: edge.interaction.id,
        })
      } else if (!visited.has(edge.target)) {
        dfs(edge.target)
      }
    }
    stack.pop()
    visiting.delete(pageId)
    visited.add(pageId)
  }

  for (const page of project.pages) {
    if (!visited.has(page.id)) dfs(page.id)
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers reused by the canvas
// ---------------------------------------------------------------------------

/** Trigger labels for selects, in schema order. */
export const TRIGGERS: readonly Trigger[] = ['click', 'dblclick', 'change', 'submit', 'load']

/** Page kinds the canvas can target with overlay actions. */
export function isOverlayAction(
  actionType: string,
): actionType is 'openModal' | 'openDrawer' | 'navigate' {
  return actionType === 'openModal' || actionType === 'openDrawer' || actionType === 'navigate'
}
