/**
 * BuildBlueprint (tasklist P04.15): the normalized, build-only projection
 * of a project that Codex implements. Deterministic by construction —
 * no timestamps, no UI-only state (canvas positions), stable key order —
 * so the same project always yields the same hash and meaningless diffs
 * are impossible.
 */
import { stableStringify, type JsonValue } from './json'
import { sha256Hex } from './sha256'
import type {
  Agent,
  Asset,
  CapabilityInstance,
  Component,
  DataBinding,
  Interaction,
  Page,
  ProjectRoot,
  Variable,
} from './project'

export const BLUEPRINT_VERSION = 1

export interface BuildBlueprint {
  blueprintVersion: number
  schemaVersion: number
  /** project id + name only — no created/updated timestamps */
  project: { id: string; name: string }
  pages: Page[]
  components: Component[]
  agents: Agent[]
  capabilities: CapabilityInstance[]
  interactions: Interaction[]
  bindings: DataBinding[]
  variables: Variable[]
  assets: Asset[]
  settings: ProjectRoot['settings']
}

/** Convert a validated project into its build blueprint. */
export function toBuildBlueprint(project: ProjectRoot): BuildBlueprint {
  return {
    blueprintVersion: BLUEPRINT_VERSION,
    schemaVersion: project.schemaVersion,
    project: { id: project.id, name: project.name },
    pages: project.pages.map(stripPageUiState),
    components: project.components,
    agents: project.agents,
    capabilities: project.capabilities,
    interactions: project.interactions,
    bindings: project.bindings,
    variables: project.variables,
    assets: project.assets,
    settings: project.settings,
  }
}

/** Interaction-canvas node positions are UI state and must not affect builds. */
function stripPageUiState(page: Page): Page {
  const { canvasPosition: _dropped, ...metadata } = page.metadata
  return { ...page, metadata }
}

/** Canonical JSON bytes of a blueprint (sorted keys, no whitespace). */
export function blueprintCanonicalJson(blueprint: BuildBlueprint): string {
  return stableStringify(blueprint as unknown as JsonValue)
}

/** SHA-256 of the canonical form — equal for equal blueprints, always. */
export function blueprintHash(blueprint: BuildBlueprint): string {
  return sha256Hex(blueprintCanonicalJson(blueprint))
}
