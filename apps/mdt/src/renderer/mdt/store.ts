/**
 * MDT project store (renderer) — the document model for everything beyond
 * raw slide visuals: pages/elements derived from the deck (via @mdt/design)
 * plus agents, capability instances, interactions, bindings and variables.
 * The store persists through the main process (project IO IPC) and feeds
 * the Interaction Canvas, Agents panel and Builder.
 */
import { createId, validateRefs, type ElementRole, type ProjectRoot } from '@mdt/schema'
import { create } from 'zustand'

import {
  derivePages,
  emptyOverlay,
  isMdtMarker,
  type DerivedElement,
  type DesignPageRef,
  type MdtOverlay,
} from '@mdt/design'

export interface MdtUiState {
  activeView: 'designer' | 'interactions'
  currentPageId: string | undefined
}

/**
 * Semantics waiting for the element inserted by the MDT control pipeline
 * (mdt-insert.ts) to appear in a derivation. Keyed by the marker carried in
 * the engine element's name ("MDT:<role>:<uuid>"); consumed by
 * `syncFromDesign` the first time a derived element matches (P06.19–P06.26).
 */
export interface PendingElementSemantics {
  marker: string
  role: ElementRole
  /** accessible/semantic name; also becomes the element's friendly display name */
  label: string
  placeholder?: string
  options?: string[]
  agentRef?: string
}

/** Exact marker match first, then FIFO for any other marker-named element. */
export function matchPendingSemantics(
  pending: PendingElementSemantics[],
  elName: string,
): { entry: PendingElementSemantics; rest: PendingElementSemantics[] } | undefined {
  const idx = pending.findIndex((p) => p.marker === elName)
  const i = idx >= 0 ? idx : isMdtMarker(elName) && pending.length > 0 ? 0 : -1
  if (i < 0) return undefined
  const entry = pending[i]!
  return { entry, rest: [...pending.slice(0, i), ...pending.slice(i + 1)] }
}

export interface MdtStore {
  project: ProjectRoot | null
  overlay: MdtOverlay
  ui: MdtUiState
  dirty: boolean
  refIssues: { code: string; message: string; path: string }[]
  /** insert-time semantics not yet matched to a derived element (see above) */
  pendingSemantics: PendingElementSemantics[]

  /** called when the slides engine reports the current deck structure */
  syncFromDesign(pages: DesignPageRef[]): void
  /** queue semantics for the next derived element matching the marker */
  queuePendingSemantics(entry: PendingElementSemantics): void
  /** pop the pending entry matching a (marker) element name, if any */
  consumePendingSemantics(elName: string): PendingElementSemantics | undefined
  setActiveView(view: MdtUiState['activeView']): void
  setCurrentPage(pageId: string): void

  newProject(name: string): void
  loadProject(project: ProjectRoot, overlay: MdtOverlay): void

  addAgent(input: {
    name: string
    instructions: string
    provider: string
    model: string
    baseUrl?: string
  }): void
  updateAgent(id: string, patch: Partial<ProjectRoot['agents'][number]>): void
  deleteAgent(id: string): { removed: boolean; blockedBy?: string[] }

  addCapabilityInstance(instance: ProjectRoot['capabilities'][number]): void
  removeCapabilityInstance(id: string): void
  assignCapability(agentId: string, instanceId: string): void
  unassignCapability(agentId: string, instanceId: string): void

  setDefaultAgent(id: string): void

  addInteraction(interaction: ProjectRoot['interactions'][number]): void
  updateInteraction(id: string, patch: Partial<ProjectRoot['interactions'][number]>): void
  deleteInteraction(id: string): void

  updateElementSemantics(
    pageId: string,
    elementId: string,
    patch: Partial<ProjectRoot['pages'][number]['elements'][number]['semantics']>,
  ): void
  setNodeType(
    pageId: string,
    type: ProjectRoot['pages'][number]['type'],
    drawerSide?: 'left' | 'right',
  ): void
  setNodePosition(pageId: string, x: number, y: number): void
}

export const useMdtStore = create<MdtStore>((set, get) => ({
  project: null,
  overlay: emptyOverlay(),
  ui: { activeView: 'designer', currentPageId: undefined },
  dirty: false,
  refIssues: [],
  pendingSemantics: [],

  syncFromDesign(pages) {
    const { project, overlay } = get()
    if (!project) return
    const derived = derivePages(pages, overlay, createId)
    // Insert pipeline: consume queued semantics for marker-named elements as
    // the derivation assigns them stable ids
    let pending = get().pendingSemantics
    const consume = (elName: string): PendingElementSemantics | undefined => {
      const m = matchPendingSemantics(pending, elName)
      if (!m) return undefined
      pending = m.rest
      return m.entry
    }
    const updated: ProjectRoot = {
      ...project,
      pages: derived.pages.map((page) => {
        const existing = project.pages.find((p) => p.id === page.id)
        return {
          id: page.id,
          name: page.name,
          type: overlay.pageTypes[page.slideId] ?? existing?.type ?? 'page',
          viewport: existing?.viewport ?? { width: 1440, height: 1024, preset: 'desktop-1440' },
          background: existing?.background ?? {},
          elements: page.elements.map((el) => {
            const existingEl = existing?.elements.find((e) => e.id === el.id)
            return applyPendingSemantics(
              toSchemaElement(el, existingEl),
              el.name,
              existingEl,
              consume,
            )
          }),
          metadata: existing?.metadata ?? {},
        }
      }),
    }
    set({
      project: updated,
      overlay: derived.overlay,
      dirty: true,
      refIssues: collectIssues(updated),
      ...(pending !== get().pendingSemantics ? { pendingSemantics: pending } : {}),
    })
  },

  queuePendingSemantics(entry) {
    set({ pendingSemantics: [...get().pendingSemantics, entry] })
  },

  consumePendingSemantics(elName) {
    const m = matchPendingSemantics(get().pendingSemantics, elName)
    if (!m) return undefined
    set({ pendingSemantics: m.rest })
    return m.entry
  },

  setActiveView(view) {
    set({ ui: { ...get().ui, activeView: view } })
  },

  setCurrentPage(pageId) {
    set({ ui: { ...get().ui, currentPageId: pageId } })
  },

  newProject(name) {
    const project: ProjectRoot = {
      schemaVersion: 1,
      id: createId(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    }
    set({
      project,
      overlay: emptyOverlay(),
      dirty: true,
      ui: { ...get().ui, currentPageId: undefined },
      pendingSemantics: [],
    })
  },

  loadProject(project, overlay) {
    set({
      project,
      overlay,
      dirty: false,
      ui: { ...get().ui, currentPageId: project.pages[0]?.id },
      pendingSemantics: [],
    })
  },

  addAgent(input) {
    const { project } = get()
    if (!project) return
    const agent: ProjectRoot['agents'][number] = {
      id: createId(),
      name: input.name,
      description: '',
      instructions: input.instructions,
      modelPolicy: {
        provider: input.provider,
        model: input.model,
        ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
        api: 'openai-completions',
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      },
      capabilityRefs: [],
      memory: { enabled: false },
      isDefault: project.agents.length === 0,
    }
    set({ project: { ...project, agents: [...project.agents, agent] }, dirty: true })
  },

  updateAgent(id, patch) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        agents: project.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      },
      dirty: true,
    })
  },

  deleteAgent(id) {
    const { project } = get()
    if (!project) return { removed: false, blockedBy: ['project'] }
    const blockedBy: string[] = []
    for (const page of project.pages) {
      for (const el of page.elements) {
        if (el.semantics.agentRef === id) blockedBy.push(`chat "${el.name}" on page "${page.name}"`)
      }
    }
    for (const interaction of project.interactions) {
      if (interaction.action.type === 'sendToAgent' && interaction.action.agentId === id) {
        blockedBy.push('a send-to-agent interaction')
      }
    }
    if (blockedBy.length > 0) return { removed: false, blockedBy }
    const agents = project.agents.filter((a) => a.id !== id)
    set({
      project: {
        ...project,
        agents,
        settings: {
          ...project.settings,
          defaultAgentId:
            project.settings.defaultAgentId === id ? undefined : project.settings.defaultAgentId,
        },
      },
      dirty: true,
    })
    return { removed: true }
  },

  addCapabilityInstance(instance) {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, capabilities: [...project.capabilities, instance] }, dirty: true })
  },

  removeCapabilityInstance(id) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        capabilities: project.capabilities.filter((c) => c.id !== id),
        agents: project.agents.map((a) => ({
          ...a,
          capabilityRefs: a.capabilityRefs.filter((r) => r !== id),
        })),
        interactions: project.interactions.filter(
          (i) =>
            !(i.action.type === 'invokeCapability' && i.action.capabilityInstanceId === id) &&
            !(
              i.action.type === 'bindOutput' &&
              i.action.source.type === 'capabilityOutput' &&
              i.action.source.capabilityInstanceId === id
            ),
        ),
      },
      dirty: true,
    })
  },

  assignCapability(agentId, instanceId) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        agents: project.agents.map((a) =>
          a.id === agentId && !a.capabilityRefs.includes(instanceId)
            ? { ...a, capabilityRefs: [...a.capabilityRefs, instanceId] }
            : a,
        ),
      },
      dirty: true,
    })
  },

  unassignCapability(agentId, instanceId) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        agents: project.agents.map((a) =>
          a.id === agentId
            ? { ...a, capabilityRefs: a.capabilityRefs.filter((r) => r !== instanceId) }
            : a,
        ),
      },
      dirty: true,
    })
  },

  setDefaultAgent(id) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        agents: project.agents.map((a) => ({ ...a, isDefault: a.id === id })),
        settings: { ...project.settings, defaultAgentId: id },
      },
      dirty: true,
    })
  },

  addInteraction(interaction) {
    const { project } = get()
    if (!project) return
    set({
      project: { ...project, interactions: [...project.interactions, interaction] },
      dirty: true,
      refIssues: collectIssues({
        ...project,
        interactions: [...project.interactions, interaction],
      }),
    })
  },

  updateInteraction(id, patch) {
    const { project } = get()
    if (!project) return
    const interactions = project.interactions.map((i) => (i.id === id ? { ...i, ...patch } : i))
    set({
      project: { ...project, interactions },
      dirty: true,
      refIssues: collectIssues({ ...project, interactions }),
    })
  },

  deleteInteraction(id) {
    const { project } = get()
    if (!project) return
    const interactions = project.interactions.filter((i) => i.id !== id)
    set({
      project: { ...project, interactions },
      dirty: true,
      refIssues: collectIssues({ ...project, interactions }),
    })
  },

  updateElementSemantics(pageId, elementId, patch) {
    const { project } = get()
    if (!project) return
    const visit = (
      els: ProjectRoot['pages'][number]['elements'],
    ): ProjectRoot['pages'][number]['elements'] =>
      els.map((el) =>
        el.id === elementId
          ? { ...el, semantics: { ...el.semantics, ...patch } }
          : { ...el, children: visit(el.children) },
      )
    set({
      project: {
        ...project,
        pages: project.pages.map((p) =>
          p.id === pageId ? { ...p, elements: visit(p.elements) } : p,
        ),
      },
      dirty: true,
    })
  },

  setNodeType(pageId, type, drawerSide) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        pages: project.pages.map((p) =>
          p.id === pageId
            ? { ...p, type, metadata: { ...p.metadata, ...(drawerSide ? { drawerSide } : {}) } }
            : p,
        ),
      },
      dirty: true,
    })
  },

  setNodePosition(pageId, x, y) {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        pages: project.pages.map((p) =>
          p.id === pageId ? { ...p, metadata: { ...p.metadata, canvasPosition: { x, y } } } : p,
        ),
      },
    }) // canvas positions are pure UI state: not dirty
  },
}))

function toSchemaElement(
  el: DerivedElement,
  existing: ProjectRoot['pages'][number]['elements'][number] | undefined,
): ProjectRoot['pages'][number]['elements'][number] {
  return {
    id: el.id,
    name: el.name,
    role: (el.role === 'chat' || el.role === 'input'
      ? el.role
      : (existing?.role ?? el.role)) as ProjectRoot['pages'][number]['elements'][number]['role'],
    visual: {
      kind: el.visual.kind,
      geometry: el.visual.geometry,
      style: el.visual.style,
      props: el.visual.props,
    },
    semantics: { ...existing?.semantics, handles: existing?.semantics.handles ?? [] },
    locked: existing?.locked ?? false,
    hidden: existing?.hidden ?? false,
    children: el.children.map((c) => toSchemaElement(c, undefined)),
  }
}

/**
 * Insert pipeline (P06.19–P06.26): a freshly inserted MDT control derives with
 * its marker name ("MDT:<role>:<uuid>"). The queued semantics assign the real
 * role/label/placeholder/options and swap the marker for a friendly name; on
 * later syncs the friendly name is kept (the engine keeps the marker).
 */
function applyPendingSemantics(
  el: ProjectRoot['pages'][number]['elements'][number],
  derivedName: string,
  existing: ProjectRoot['pages'][number]['elements'][number] | undefined,
  consume: (elName: string) => PendingElementSemantics | undefined,
): ProjectRoot['pages'][number]['elements'][number] {
  if (!isMdtMarker(derivedName)) return el
  const entry = consume(derivedName)
  if (!entry) return { ...el, name: existing?.name ?? el.name }
  return {
    ...el,
    name: entry.label.trim() !== '' ? entry.label : el.name,
    role: entry.role,
    semantics: {
      ...el.semantics,
      label: entry.label,
      ...(entry.placeholder !== undefined ? { placeholder: entry.placeholder } : {}),
      ...(entry.options !== undefined ? { options: entry.options } : {}),
      ...(entry.agentRef !== undefined ? { agentRef: entry.agentRef } : {}),
    },
  }
}

function collectIssues(project: ProjectRoot) {
  return validateRefs(project).issues.map((i) => ({
    code: i.code,
    message: i.message,
    path: i.path,
  }))
}
