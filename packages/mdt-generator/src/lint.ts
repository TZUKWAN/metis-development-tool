/**
 * Blueprint lint (P11.22): schema re-validation + reference integrity +
 * capability required-args/manifest checks. The generator refuses to emit
 * when any issue has severity "error".
 */
import { ProjectRootSchema, validateRefs, type BuildBlueprint, type ProjectRoot } from '@mdt/schema'
import { isVersionCompatible, type CapabilityManifest } from '@mdt/capabilities'

import type { BlueprintIssue, LintReport } from './types'

/** Placeholder timestamps so blueprint → ProjectRoot re-validation is deterministic. */
const EPOCH = '1970-01-01T00:00:00.000Z'

export function blueprintToProject(blueprint: BuildBlueprint): ProjectRoot {
  return {
    schemaVersion: blueprint.schemaVersion as ProjectRoot['schemaVersion'],
    id: blueprint.project.id,
    name: blueprint.project.name,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    pages: blueprint.pages,
    components: blueprint.components,
    agents: blueprint.agents,
    capabilities: blueprint.capabilities,
    interactions: blueprint.interactions,
    bindings: blueprint.bindings,
    variables: blueprint.variables,
    assets: blueprint.assets,
    settings: blueprint.settings,
  }
}

export function lintBlueprint(
  blueprint: BuildBlueprint,
  manifests: Map<string, CapabilityManifest>,
): LintReport {
  const issues: BlueprintIssue[] = []

  // 1. schema re-validation (build blueprints strip UI state; the project
  //    schema must still accept the result verbatim)
  const parsed = ProjectRootSchema.safeParse(blueprintToProject(blueprint))
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: 'schema.invalid',
        severity: 'error',
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      })
    }
  }
  const project = blueprintToProject(blueprint)

  // 2. reference integrity (agents, pages, elements, variables, bindings, …)
  const schemas = new Map<string, { required?: readonly string[] }>()
  for (const [id, manifest] of manifests) {
    schemas.set(id, { required: manifest.inputSchema.required })
  }
  const refReport = validateRefs(project, { capabilityInputSchemas: schemas })
  for (const refIssue of refReport.issues) {
    issues.push({ ...refIssue })
  }

  // 3. capability instances: manifest existence, version pin, required secrets
  blueprint.capabilities.forEach((instance, index) => {
    const path = `capabilities[${index}]`
    const manifest = manifests.get(instance.capabilityId)
    if (!manifest) {
      issues.push({
        code: 'capability.manifest.missing',
        severity: 'error',
        path: `${path}.capabilityId`,
        message: `capability "${instance.capabilityId}" is not in the registry`,
      })
      return
    }
    if (!isVersionCompatible(manifest.version, instance.version)) {
      issues.push({
        code: 'capability.version.incompatible',
        severity: 'error',
        path: `${path}.version`,
        message: `instance pins ${instance.version} but the registry provides ${manifest.version} for "${instance.capabilityId}"`,
      })
    }
    for (const secret of manifest.secrets) {
      if (secret.required && !(secret.name in instance.secrets)) {
        issues.push({
          code: 'capability.secret.missing',
          severity: 'error',
          path: `${path}.secrets`,
          message: `capability "${instance.capabilityId}" requires secret "${secret.name}"`,
        })
      }
    }
  })

  const ok = issues.every((issue) => issue.severity !== 'error')
  issues.sort((a, b) => (a.path + a.code).localeCompare(b.path + b.code))
  return { ok, issues }
}
