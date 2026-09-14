/**
 * Server-side codegen (P11.09–P11.11): Pi agent configuration
 * (server/agents.config.json — the absolute source of truth the service
 * loads), self-contained capability modules (P11.21: no @mdt/* dependency —
 * the generator inlines the capability implementation including its security
 * guards), and the capability host module.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import type { Agent, BuildBlueprint, CapabilityInstance } from '@mdt/schema'
import type { CapabilityManifest } from '@mdt/capabilities'

import { stableJson } from '../naming.js'

const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'capability-runtime')

/** Capability ids with a bundled self-contained runtime implementation. */
export const BUNDLED_CAPABILITY_IDS = [
  'ask_user',
  'datetime',
  'file_list',
  'file_read',
  'file_write',
  'http_request',
  'json',
  'python',
  'shell',
  'web_fetch',
  'web_search',
] as const

export interface ServerEmit {
  agentsConfigFile: { path: string; content: string }
  capabilityFiles: { path: string; content: string }[]
  capabilityIndexPath: string
  capabilityIndexContent: string
}

export function emitServer(
  blueprint: BuildBlueprint,
  manifests: Map<string, CapabilityManifest>,
  warnings: string[],
): ServerEmit {
  const agentIds = new Set(blueprint.agents.map((agent) => agent.id))
  const usedInstances = usedCapabilityInstances(blueprint)
  const usedCapabilityIds = [
    ...new Set(usedInstances.map((instance) => instance.capabilityId)),
  ].sort()

  for (const instance of usedInstances) {
    if (!manifests.has(instance.capabilityId)) {
      warnings.push(
        `capability instance ${instance.id} references "${instance.capabilityId}" which is not in the provided manifests — skipped (lint should refuse generation)`,
      )
    }
  }
  for (const capabilityId of usedCapabilityIds) {
    if (!BUNDLED_CAPABILITY_IDS.includes(capabilityId as (typeof BUNDLED_CAPABILITY_IDS)[number])) {
      warnings.push(
        `capability "${capabilityId}" has no bundled runtime in this generator build — a stub that throws at execute time is emitted (the agent sees a structured tool error)`,
      )
    }
  }
  // agents referencing capabilities that no instance provides
  for (const agent of blueprint.agents) {
    for (const ref of agent.capabilityRefs) {
      if (!usedInstances.some((instance) => instance.id === ref) && !agentIds.has(ref)) {
        warnings.push(
          `agent "${agent.name}" references capability instance ${ref} which does not exist`,
        )
      }
    }
  }

  return {
    agentsConfigFile: emitAgentsConfig(blueprint, manifests),
    capabilityFiles: usedCapabilityIds.map((capabilityId) =>
      emitCapabilityModule(capabilityId, manifests.get(capabilityId)),
    ),
    capabilityIndexPath: 'server/capabilities/index.js',
    capabilityIndexContent: emitCapabilityIndex(usedInstances, manifests),
  }
}

/** Instances actually reachable from agents (assigned via capabilityRefs). */
function usedCapabilityInstances(blueprint: BuildBlueprint): CapabilityInstance[] {
  return blueprint.capabilities.filter((instance) =>
    blueprint.agents.some((agent) => agent.capabilityRefs.includes(instance.id)),
  )
}

/** Per-agent Pi configuration incl. tool refs (P11.09). */
function emitAgentsConfig(
  blueprint: BuildBlueprint,
  manifests: Map<string, CapabilityManifest>,
): { path: string; content: string } {
  const agents = blueprint.agents.map((agent: Agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    modelPolicy: {
      provider: agent.modelPolicy.provider,
      model: agent.modelPolicy.model,
      ...(agent.modelPolicy.baseUrl !== undefined ? { baseUrl: agent.modelPolicy.baseUrl } : {}),
      ...(agent.modelPolicy.temperature !== undefined
        ? { temperature: agent.modelPolicy.temperature }
        : {}),
      ...(agent.modelPolicy.maxTokens !== undefined
        ? { maxTokens: agent.modelPolicy.maxTokens }
        : {}),
      api: agent.modelPolicy.api,
      ...(agent.modelPolicy.compat !== undefined ? { compat: agent.modelPolicy.compat } : {}),
    },
    memory: agent.memory,
    isDefault: agent.isDefault,
    /** capability instances assigned to this agent → RegisteredTools */
    capabilityInstanceIds: agent.capabilityRefs.filter((ref) =>
      blueprint.capabilities.some((instance) => instance.id === ref),
    ),
  }))
  // tool schema passthrough notice: manifests travel inside the capability modules
  const toolManifests = usedCapabilityInstances(blueprint)
    .map((instance) => manifests.get(instance.capabilityId))
    .filter((manifest): manifest is CapabilityManifest => manifest !== undefined)
    .map((manifest) => ({
      id: manifest.id,
      version: manifest.version,
      description: manifest.description,
      inputSchema: manifest.inputSchema,
    }))
  const content = `${stableJson({ agents, tools: toolManifests })}
`
  return { path: 'server/agents.config.json', content }
}

/**
 * One self-contained module per used capability: stable manifest JSON plus a
 * verbatim copy of the generator's plain-JS runtime (guards included).
 */
function emitCapabilityModule(
  capabilityId: string,
  manifest: CapabilityManifest | undefined,
): { path: string; content: string } {
  const manifestLiteral =
    manifest === undefined
      ? stableJson({
          id: capabilityId,
          name: capabilityId,
          version: '0.0.0',
          category: 'data',
          description: `Capability ${capabilityId} (manifest unavailable at generation time)`,
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          outputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          permissions: [],
          secrets: [],
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        })
      : stableJson(manifest)

  const runtimePath = join(RUNTIME_DIR, `${capabilityId}.js`)
  let runtime: string
  try {
    runtime = readFileSync(runtimePath, 'utf8')
  } catch {
    runtime = unsupportedStub(capabilityId)
  }
  const header = `/**
 * Generated capability module — "${capabilityId}" (generator-owned).
 * Self-contained by construction (P11.21): plain JavaScript, zero npm
 * dependencies, no @mdt/* imports. The manifest below is the registry
 * manifest at generation time; \`execute(input, ctx)\` follows the MDT
 * capability contract (throws on failure, honors ctx.signal, never
 * returns raw secrets).
 */
export const manifest = ${manifestLiteral}

`
  return { path: `server/capabilities/${capabilityId}.js`, content: `${header}${runtime}` }
}

/**
 * Throw-at-execute-time stubs for capabilities without a bundled runtime.
 * Known ids get a message naming exactly what the generated app is missing;
 * unknown ids fall back to the generic guidance. The emitServer warning list
 * still records every unbundled id so lint output stays honest.
 */
const STUB_MESSAGES: Record<string, string> = {
  mcp: 'MCP transport is not bundled in this generated app — add server/mcp-transport.js',
  browser: 'browser capability requires a Playwright driver — register one in server/index.js',
}

const GENERIC_STUB_MESSAGE =
  'this capability has no bundled runtime in the current @mdt/generator build — remove it from the project or implement server/capabilities/<id>.js'

function unsupportedStub(capabilityId: string): string {
  const message = STUB_MESSAGES[capabilityId] ?? GENERIC_STUB_MESSAGE
  return `export async function execute() {
  throw new Error(
    ${JSON.stringify(message)},
  )
}
`
}

function emitCapabilityIndex(
  instances: CapabilityInstance[],
  manifests: Map<string, CapabilityManifest>,
): string {
  const usedIds = [...new Set(instances.map((instance) => instance.capabilityId))].sort()
  const imports = usedIds
    .map(
      (id) =>
        `import { manifest as ${importAlias(id)}Manifest, execute as ${importAlias(id)}Execute } from './${id}.js'`,
    )
    .join('\n')
  const executors = usedIds
    .map(
      (id) =>
        `  ${JSON.stringify(id)}: { manifest: ${importAlias(id)}Manifest, execute: ${importAlias(id)}Execute },`,
    )
    .join('\n')
  const instanceEntries = instances.map((instance) => {
    const manifest = manifests.get(instance.capabilityId)
    const secretEnv: Record<string, string> = {}
    for (const slot of Object.keys(instance.secrets)) {
      secretEnv[slot] = `MDT_SECRET_${slot.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`
    }
    const grantedScopes = (manifest?.permissions ?? [])
      .filter((permission) => {
        const grant = instance.permissions.find((candidate) => candidate.scope === permission.scope)
        return grant ? grant.granted : permission.defaultGranted
      })
      .map((permission) => permission.scope)
    return `  {
    instanceId: ${JSON.stringify(instance.id)},
    capabilityId: ${JSON.stringify(instance.capabilityId)},
    config: ${stableJson(instance.config)},
    secretEnv: ${stableJson(secretEnv)},
    grantedScopes: ${stableJson(grantedScopes)},
  },`
  })
  return `/**
 * Generated capability host (generator-owned — regenerated by @mdt/generator).
 * Loads every capability module used by the project and wires the project's
 * capability instances (config, secret env names, granted permission scopes).
 * server/index.js consumes this module — it is the security boundary.
 */

${imports}

/** capability id → { manifest, execute } for every capability used by the project. */
export const capabilityExecutors = {
${executors}
}

/** Project capability instances with resolved config/permission wiring. */
export const capabilityInstances = [
${instanceEntries.join('\n')}
]
`
}

function importAlias(capabilityId: string): string {
  return `cap_${capabilityId.replace(/[^A-Za-z0-9]/g, '_')}`
}
