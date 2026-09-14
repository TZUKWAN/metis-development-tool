/**
 * MDT Interaction Canvas (tasklist P07): a @xyflow/react graph of pages
 * (plus agents) with one edge per interaction. Drag connections to create
 * interactions, click an edge to inspect/edit it, drag nodes to persist
 * canvas positions in page metadata, double-click a page to open it in the
 * designer. Real page thumbnails land later via the deck offscreen
 * renderer; nodes show a placeholder card until then (P07.05+, P07.21–23).
 */
import '@xyflow/react/dist/style.css'

import {
  createId,
  INTERACTIVE_ROLES,
  type BindingSource,
  type Element,
  type Interaction,
  type InteractionAction,
  type ProjectRoot,
} from '@mdt/schema'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type OnNodeDrag,
} from '@xyflow/react'
import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { useCapabilityCatalog } from './capability-catalog'
import {
  deriveGraph,
  describeAction,
  lintGraph,
  TRIGGERS,
  type GraphIssue,
  type GraphNodeKind,
} from './interaction-graph'
import { useMdtStore } from './store'

// ---------------------------------------------------------------------------
// Canvas view-model types
// ---------------------------------------------------------------------------

type PageNodeData = {
  kind: Exclude<GraphNodeKind, 'agent'>
  label: string
  elementCount: number
}
type AgentNodeData = { kind: 'agent'; label: string; capabilityCount: number }
type PageCanvasNode = Node<PageNodeData, 'mdtPage'>
type AgentCanvasNode = Node<AgentNodeData, 'mdtAgent'>
type CanvasNode = PageCanvasNode | AgentCanvasNode
type CanvasEdge = Edge

const KIND_BADGE: Record<string, string> = {
  page: '#dbeafe',
  modal: '#ede9fe',
  drawer: '#dcfce7',
  popover: '#fef3c7',
  component: '#e2e8f0',
  agent: '#e0f2fe',
}

// ---------------------------------------------------------------------------
// Custom nodes (memoized — P07.23)
// ---------------------------------------------------------------------------

const PageNodeView = memo(function PageNodeView({
  data,
  selected,
}: NodeProps<PageCanvasNode>): React.ReactElement {
  const badge = KIND_BADGE[data.kind] ?? KIND_BADGE.page!
  return (
    <div
      style={{
        width: 200,
        border: `1px solid ${selected ? '#2563eb' : '#cbd5e1'}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: selected ? '0 0 0 2px #bfdbfe' : '0 1px 3px rgba(15, 23, 42, 0.15)',
      }}
    >
      {/* placeholder until real thumbnails come from the offscreen renderer */}
      <div
        style={{
          height: 64,
          background: badge,
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          color: '#334155',
        }}
      >
        {data.label}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          fontSize: 11,
        }}
      >
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.label}</strong>
        <span
          style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 8,
            background: badge,
            whiteSpace: 'nowrap',
          }}
        >
          {data.kind} · {data.elementCount} el
        </span>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
})

const AgentNodeView = memo(function AgentNodeView({
  data,
  selected,
}: NodeProps<AgentCanvasNode>): React.ReactElement {
  return (
    <div
      style={{
        width: 160,
        padding: 8,
        border: `1px solid ${selected ? '#2563eb' : '#7dd3fc'}`,
        borderRadius: 8,
        background: '#f0f9ff',
        fontSize: 12,
        boxShadow: selected ? '0 0 0 2px #bfdbfe' : undefined,
      }}
    >
      🤖 <strong>{data.label}</strong>
      <div style={{ fontSize: 10, opacity: 0.7 }}>{data.capabilityCount} capabilities</div>
      <Handle type="target" position={Position.Left} />
    </div>
  )
})

const nodeTypes = { mdtPage: PageNodeView, mdtAgent: AgentNodeView }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PageActionType = 'navigate' | 'openModal' | 'openDrawer'

function collectInteractiveElements(
  elements: Element[],
  out: { id: string; name: string }[],
): void {
  for (const el of elements) {
    if (INTERACTIVE_ROLES.includes(el.role))
      out.push({ id: el.id, name: `${el.name} (${el.role})` })
    collectInteractiveElements(el.children, out)
  }
}

function firstAgentId(project: ProjectRoot): string | undefined {
  return project.agents[0]?.id
}

function firstCapabilityInstanceId(project: ProjectRoot): string | undefined {
  return project.capabilities[0]?.id
}

function firstVariableId(project: ProjectRoot): string | undefined {
  return project.variables[0]?.id
}

function firstInteractiveElementId(project: ProjectRoot, pageId: string): string | undefined {
  const page = project.pages.find((p) => p.id === pageId)
  if (!page) return undefined
  const out: { id: string; name: string }[] = []
  collectInteractiveElements(page.elements, out)
  return out[0]?.id
}

/** Sensible creation actions for a connection whose target is `targetKind`. */
function sensibleActions(targetKind: GraphNodeKind): {
  actionType: PageActionType | 'sendToAgent'
  label: string
  disabled: boolean
}[] {
  if (targetKind === 'agent') {
    return [{ actionType: 'sendToAgent', label: 'Send to agent', disabled: false }]
  }
  return [
    { actionType: 'navigate', label: 'Navigate', disabled: false },
    {
      actionType: 'openModal',
      label: 'Open modal',
      disabled: targetKind !== 'modal',
    },
    {
      actionType: 'openDrawer',
      label: 'Open drawer',
      disabled: targetKind !== 'drawer',
    },
  ]
}

function actionForTarget(
  actionType: PageActionType | 'sendToAgent',
  targetId: string,
): InteractionAction {
  switch (actionType) {
    case 'navigate':
      return { type: 'navigate', targetPageId: targetId }
    case 'openModal':
      return { type: 'openModal', targetPageId: targetId }
    case 'openDrawer':
      return { type: 'openDrawer', targetPageId: targetId }
    case 'sendToAgent':
      return { type: 'sendToAgent', agentId: targetId, payload: { type: 'literal', value: '' } }
  }
}

/**
 * Rebuild the action when the immutable discriminator changes. Reuses
 * compatible fields from the previous action; returns `undefined` when the
 * new type cannot be built with the current project (missing agents,
 * variables, …).
 */
function buildAction(
  nextType: InteractionAction['type'],
  prev: InteractionAction,
  project: ProjectRoot,
  sourcePageId: string,
): InteractionAction | undefined {
  if (prev.type === nextType) return prev
  const oldTargetPageId =
    prev.type === 'navigate' || prev.type === 'openModal' || prev.type === 'openDrawer'
      ? prev.targetPageId
      : undefined
  const oldTargetElementId =
    prev.type === 'toggleVisibility' || prev.type === 'bindOutput'
      ? prev.targetElementId
      : undefined
  const fallbackPage = (kind?: 'modal' | 'drawer'): string => {
    if (kind) {
      const match = project.pages.find((p) => p.type === kind)
      if (match) return match.id
    }
    return oldTargetPageId ?? project.pages[0]?.id ?? sourcePageId
  }
  switch (nextType) {
    case 'navigate':
      return { type: 'navigate', targetPageId: fallbackPage() }
    case 'openModal':
      return { type: 'openModal', targetPageId: fallbackPage('modal') }
    case 'openDrawer':
      return { type: 'openDrawer', targetPageId: fallbackPage('drawer') }
    case 'close':
      return { type: 'close' }
    case 'back':
      return { type: 'back' }
    case 'toggleVisibility': {
      const el = oldTargetElementId ?? firstInteractiveElementId(project, sourcePageId)
      return el ? { type: 'toggleVisibility', targetElementId: el } : undefined
    }
    case 'submit':
      return { type: 'submit' }
    case 'sendToAgent': {
      const agentId = prev.type === 'sendToAgent' ? prev.agentId : firstAgentId(project)
      if (!agentId) return undefined
      const payload: BindingSource =
        prev.type === 'sendToAgent' ? prev.payload : { type: 'literal', value: '' }
      return { type: 'sendToAgent', agentId, payload }
    }
    case 'invokeCapability': {
      const capabilityInstanceId =
        prev.type === 'invokeCapability'
          ? prev.capabilityInstanceId
          : firstCapabilityInstanceId(project)
      if (!capabilityInstanceId) return undefined
      const args = prev.type === 'invokeCapability' ? prev.args : {}
      return { type: 'invokeCapability', capabilityInstanceId, args }
    }
    case 'setVariable': {
      const variableId = prev.type === 'setVariable' ? prev.variableId : firstVariableId(project)
      if (!variableId) return undefined
      const value: BindingSource =
        prev.type === 'setVariable' ? prev.value : { type: 'literal', value: '' }
      return { type: 'setVariable', variableId, value }
    }
    case 'bindOutput': {
      const targetElementId = oldTargetElementId ?? firstInteractiveElementId(project, sourcePageId)
      if (!targetElementId) return undefined
      if (prev.type === 'bindOutput') {
        return { ...prev, targetElementId }
      }
      const agentId = firstAgentId(project)
      const source = agentId
        ? { type: 'agentOutput' as const, agentId }
        : (() => {
            const capabilityInstanceId = firstCapabilityInstanceId(project)
            return capabilityInstanceId
              ? { type: 'capabilityOutput' as const, capabilityInstanceId }
              : undefined
          })()
      if (!source) return undefined
      return { type: 'bindOutput', source, targetElementId, property: 'text' }
    }
  }
}

// ---------------------------------------------------------------------------
// Inspector (right side overlay)
// ---------------------------------------------------------------------------

const ACTION_TYPES: readonly InteractionAction['type'][] = [
  'navigate',
  'openModal',
  'openDrawer',
  'close',
  'back',
  'toggleVisibility',
  'submit',
  'sendToAgent',
  'invokeCapability',
  'setVariable',
  'bindOutput',
]

interface InspectorProps {
  interaction: Interaction
  project: ProjectRoot
  onUpdate: (id: string, patch: Partial<Interaction>) => void
  onDelete: (id: string) => void
}

const InspectorPanel = memo(function InspectorPanel({
  interaction,
  project,
  onUpdate,
  onDelete,
}: InspectorProps): React.ReactElement {
  const [pendingType, setPendingType] = useState<InteractionAction['type'] | undefined>()
  const sourceElements = useMemo(() => {
    const page = project.pages.find((p) => p.id === interaction.sourcePageId)
    const out: { id: string; name: string }[] = []
    if (page) collectInteractiveElements(page.elements, out)
    return out
  }, [project, interaction.sourcePageId])

  const actionTypeDisabled = (t: InteractionAction['type']): boolean => {
    switch (t) {
      case 'sendToAgent':
        return project.agents.length === 0
      case 'invokeCapability':
        return project.capabilities.length === 0
      case 'setVariable':
        return project.variables.length === 0
      case 'toggleVisibility':
        return firstInteractiveElementId(project, interaction.sourcePageId) === undefined
      case 'bindOutput':
        return (
          firstInteractiveElementId(project, interaction.sourcePageId) === undefined ||
          (project.agents.length === 0 && project.capabilities.length === 0)
        )
      default:
        return false
    }
  }

  const confirmType = (): void => {
    if (!pendingType) return
    const next = buildAction(pendingType, interaction.action, project, interaction.sourcePageId)
    if (next) onUpdate(interaction.id, { action: next })
    setPendingType(undefined)
  }

  return (
    <div
      role="complementary"
      aria-label="Interaction inspector"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 230,
        maxHeight: 'calc(100% - 16px)',
        overflowY: 'auto',
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #ddd)',
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        zIndex: 10,
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Interaction</strong>
      </div>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Source element
        <select
          value={interaction.sourceElementId ?? ''}
          onChange={(e) =>
            onUpdate(interaction.id, {
              sourceElementId: e.target.value === '' ? undefined : e.target.value,
            })
          }
          style={{ width: '100%' }}
        >
          <option value="">— page level —</option>
          {sourceElements.map((el) => (
            <option key={el.id} value={el.id}>
              {el.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Trigger
        <select
          value={interaction.trigger}
          onChange={(e) =>
            onUpdate(interaction.id, { trigger: e.target.value as Interaction['trigger'] })
          }
          style={{ width: '100%' }}
        >
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginBottom: 6 }}>
        Action
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={pendingType ?? interaction.action.type}
            onChange={(e) => setPendingType(e.target.value as InteractionAction['type'])}
            style={{ flex: 1, minWidth: 0 }}
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t} disabled={actionTypeDisabled(t)}>
                {t}
              </option>
            ))}
          </select>
          {pendingType && pendingType !== interaction.action.type && (
            <button
              type="button"
              onClick={confirmType}
              title="Change action type (rebuilds action)"
            >
              ✓
            </button>
          )}
          {pendingType && (
            <button type="button" onClick={() => setPendingType(undefined)} title="Cancel">
              ✕
            </button>
          )}
        </div>
        {pendingType &&
          pendingType !== interaction.action.type &&
          buildAction(pendingType, interaction.action, project, interaction.sourcePageId) ===
            undefined && (
            <div style={{ color: 'crimson', fontSize: 11 }}>
              Cannot build “{pendingType}”: missing target object (agent/variable/element).
            </div>
          )}
      </div>

      <div style={{ marginBottom: 6, opacity: 0.8 }}>
        Target: {describeAction(project, interaction.action)}
      </div>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={interaction.enabled}
          onChange={(e) => onUpdate(interaction.id, { enabled: e.target.checked })}
        />
        enabled
      </label>

      <button type="button" onClick={() => onDelete(interaction.id)} style={{ width: '100%' }}>
        Delete interaction
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Creation popover (connection drop)
// ---------------------------------------------------------------------------

interface PendingConnection {
  source: string
  target: string
}

const CreationPopover = memo(function CreationPopover({
  pending,
  project,
  onCreate,
  onCancel,
}: {
  pending: PendingConnection
  project: ProjectRoot
  onCreate: (interaction: Interaction) => void
  onCancel: () => void
}): React.ReactElement {
  const graph = useMemo(() => deriveGraph(project), [project])
  const sourceNode = graph.nodes.find((n) => n.id === pending.source)
  const targetNode = graph.nodes.find((n) => n.id === pending.target)
  if (!sourceNode || !targetNode) return <></>
  const choices = sensibleActions(targetNode.kind)
  const build = (actionType: (typeof choices)[number]['actionType']): void => {
    onCreate({
      id: createId(),
      sourcePageId: sourceNode.id,
      trigger: 'click',
      enabled: true,
      action: actionForTarget(actionType, targetNode.id),
    })
  }
  return (
    <div
      role="dialog"
      aria-label="Create interaction"
      style={{
        position: 'absolute',
        top: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #ddd)',
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        zIndex: 12,
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)',
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <strong>
          {sourceNode.label} → {targetNode.label}
        </strong>
      </div>
      {choices.map((c) => (
        <button
          key={c.actionType}
          type="button"
          disabled={c.disabled}
          onClick={() => build(c.actionType)}
          style={{ display: 'block', width: '100%', marginBottom: 4 }}
        >
          {c.label}
          {c.disabled ? ' (needs matching overlay page)' : ''}
        </button>
      ))}
      <button type="button" onClick={onCancel} style={{ width: '100%' }}>
        Cancel
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

function InteractionCanvasInner(): React.ReactElement {
  const project = useMdtStore((s) => s.project)
  const setCurrentPage = useMdtStore((s) => s.setCurrentPage)
  const setActiveView = useMdtStore((s) => s.setActiveView)
  const addInteraction = useMdtStore((s) => s.addInteraction)
  const updateInteraction = useMdtStore((s) => s.updateInteraction)
  const deleteInteraction = useMdtStore((s) => s.deleteInteraction)
  const setNodePosition = useMdtStore((s) => s.setNodePosition)

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | undefined>()
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | undefined>()
  const [query, setQuery] = useState('')
  const [lintExpanded, setLintExpanded] = useState(false)
  const reactFlow = useReactFlow<CanvasNode, CanvasEdge>()
  const catalog = useCapabilityCatalog()

  // graph derivation + lint run only when the store project changes (P07.23)
  const graph = useMemo(
    () => (project ? deriveGraph(project) : { nodes: [], edges: [] }),
    [project],
  )
  const capabilityManifests = useMemo(
    () =>
      new Map(
        [...catalog.entries()].map(([id, manifest]) => [id, { inputSchema: manifest.inputSchema }]),
      ),
    [catalog],
  )
  const issues = useMemo<GraphIssue[]>(
    () => (project ? lintGraph(project, { capabilityManifests }) : []),
    [project, capabilityManifests],
  )
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.length - errorCount

  // sync local flow nodes from the derived graph (positions come from the
  // store; dragging only mutates local state until drag stop persists it)
  useEffect(() => {
    setNodes(
      graph.nodes.map((n) =>
        n.kind === 'agent'
          ? {
              id: n.id,
              type: 'mdtAgent' as const,
              position: n.position,
              data: {
                kind: 'agent' as const,
                label: n.label,
                capabilityCount: n.capabilityCount ?? 0,
              },
              draggable: false,
            }
          : {
              id: n.id,
              type: 'mdtPage' as const,
              position: n.position,
              data: { kind: n.kind, label: n.label, elementCount: n.elementCount ?? 0 },
            },
      ),
    )
  }, [graph, setNodes])

  // drop the selection when the inspected interaction disappears
  useEffect(() => {
    if (
      selectedInteractionId &&
      !project?.interactions.some((i) => i.id === selectedInteractionId)
    ) {
      setSelectedInteractionId(undefined)
    }
  }, [project, selectedInteractionId])

  const rfEdges = useMemo<CanvasEdge[]>(() => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    return graph.edges.map((e) => {
      // actions without an in-graph target render as self-loops on the source
      const target = e.target !== undefined && nodeIds.has(e.target) ? e.target : e.source
      const isSelected = e.id === selectedInteractionId
      return {
        id: e.id,
        source: e.source,
        target,
        type: 'smoothstep',
        label: e.label,
        labelShowBg: true,
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        labelStyle: { fontSize: 10 },
        labelBgStyle: { fill: '#fff' },
        animated: e.enabled,
        style: {
          stroke: isSelected ? '#2563eb' : e.enabled ? '#64748b' : '#cbd5e1',
          strokeWidth: isSelected ? 2 : 1.5,
          ...(e.enabled ? {} : { strokeDasharray: '5 3' }),
        },
      }
    })
  }, [graph, selectedInteractionId])

  const handleNodeDragStop = useCallback<OnNodeDrag<CanvasNode>>(
    (_event, node) => {
      if (node.type !== 'mdtPage') return
      setNodePosition(node.id, node.position.x, node.position.y) // P07.04
    },
    [setNodePosition],
  )

  const handleNodeDoubleClick = useCallback<NodeMouseHandler<CanvasNode>>(
    (_event, node) => {
      if (node.type !== 'mdtPage') return
      setCurrentPage(node.id)
      setActiveView('designer') // P07.05
    },
    [setCurrentPage, setActiveView],
  )

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    setPendingConnection({ source: connection.source, target: connection.target })
  }, [])

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge): boolean => {
      if (connection.source === connection.target) return false
      const sourceNode = graph.nodes.find((n) => n.id === connection.source)
      return sourceNode?.kind !== 'agent' // only pages start connections
    },
    [graph],
  )

  const handleCreate = useCallback(
    (interaction: Interaction) => {
      addInteraction(interaction)
      setPendingConnection(undefined)
      setSelectedInteractionId(interaction.id)
    },
    [addInteraction],
  )

  const submitSearch = useCallback(() => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const node = nodes.find((n) => n.data.label.toLowerCase().includes(q))
    if (node) {
      // centers the viewport on the node — never touches stored positions
      void reactFlow.fitView({ nodes: [{ id: node.id }], duration: 400, maxZoom: 1.25, padding: 4 })
    }
  }, [query, nodes, reactFlow])

  if (!project) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', opacity: 0.6 }}>
        Open a project to see its interaction graph.
      </div>
    )
  }

  const selectedInteraction = project.interactions.find((i) => i.id === selectedInteractionId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--text)' }}>
      {/* lint bar (P07.22 area) */}
      <div
        style={{
          borderBottom: '1px solid var(--border, #ddd)',
          padding: '4px 8px',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            aria-expanded={lintExpanded}
            onClick={() => setLintExpanded((v) => !v)}
            style={{ fontSize: 11 }}
          >
            {lintExpanded ? '▾' : '▸'} Lint
          </button>
          <span style={{ color: errorCount > 0 ? 'crimson' : 'inherit' }}>{errorCount} errors</span>
          <span style={{ color: warningCount > 0 ? 'darkorange' : 'inherit' }}>
            {warningCount} warnings
          </span>
          <input
            aria-label="Search nodes"
            placeholder="Search pages / agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            style={{ marginLeft: 'auto', width: 140, fontSize: 11 }}
          />
        </div>
        {lintExpanded && (
          <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 120, overflowY: 'auto' }}>
            {issues.length === 0 && <li style={{ color: 'green' }}>No issues</li>}
            {issues.map((issue, i) => (
              <li
                key={`${issue.code}-${i}`}
                style={{
                  color: issue.severity === 'error' ? 'crimson' : 'darkorange',
                  cursor: issue.interactionId ? 'pointer' : 'default',
                }}
                onClick={() => issue.interactionId && setSelectedInteractionId(issue.interactionId)}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {project.pages.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              opacity: 0.6,
              padding: 16,
              textAlign: 'center',
              fontSize: 12,
            }}
          >
            No pages yet. Design slides in the designer — every page shows up here as a node you can
            wire together with interactions.
          </div>
        ) : (
          <ReactFlow<CanvasNode, CanvasEdge>
            nodes={nodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeClick={(_e, edge) => setSelectedInteractionId(edge.id)}
            onPaneClick={() => setSelectedInteractionId(undefined)}
            onConnect={handleConnect}
            isValidConnection={isValidConnection}
            deleteKeyCode={null}
            fitView
            minZoom={0.2}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        )}

        {selectedInteraction && (
          <InspectorPanel
            key={selectedInteraction.id}
            interaction={selectedInteraction}
            project={project}
            onUpdate={updateInteraction}
            onDelete={(id) => {
              deleteInteraction(id)
              setSelectedInteractionId(undefined)
            }}
          />
        )}

        {pendingConnection && (
          <CreationPopover
            pending={pendingConnection}
            project={project}
            onCreate={handleCreate}
            onCancel={() => setPendingConnection(undefined)}
          />
        )}
      </div>
    </div>
  )
}

export function InteractionCanvas(): React.ReactElement {
  return (
    <div style={{ height: '100%' }}>
      <ReactFlowProvider>
        <InteractionCanvasInner />
      </ReactFlowProvider>
    </div>
  )
}
