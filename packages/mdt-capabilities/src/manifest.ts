/**
 * Capability manifest schema (tasklist P09.01).
 *
 * A manifest is the contract between the designer UI, the generated app's
 * runtime, and the security model. Everything the registry, inspector and
 * generator need is declared here — nothing is inferred from code.
 */
import { z } from 'zod'

/** JSON Schema (draft 2020-12) object describing tool input/output. */
export const JsonSchemaObjectSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).default([]),
  additionalProperties: z.boolean().default(false),
})
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>

export const PermissionScopeSchema = z.enum([
  'network',
  'filesystem',
  'process',
  'browser',
  'user-interaction',
])
export type PermissionScope = z.infer<typeof PermissionScopeSchema>

export const PermissionDeclSchema = z.object({
  scope: PermissionScopeSchema,
  /** what the capability accesses within this scope, e.g. "http(s) fetch" */
  detail: z.string(),
  /** true when the capability cannot function without the grant */
  required: z.boolean().default(true),
  /** default state when a user inserts the capability into a project */
  defaultGranted: z.boolean().default(false),
})
export type PermissionDecl = z.infer<typeof PermissionDeclSchema>

export const SecretDeclSchema = z.object({
  /** slot name; project instances reference values via ${secret:NAME} */
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  description: z.string(),
  required: z.boolean().default(true),
})
export type SecretDecl = z.infer<typeof SecretDeclSchema>

export const CapabilityCategorySchema = z.enum([
  'web',
  'http',
  'browser',
  'filesystem',
  'process',
  'integration',
  'data',
  'user-interaction',
])

export const UiMetadataSchema = z.object({
  /** emoji or short glyph used until a real icon asset exists */
  icon: z.string().default('🧩'),
  accent: z.string().default('#5b8def'),
  /** one-line marketing summary shown in the insert gallery */
  summary: z.string(),
  /** designer keywords for search */
  keywords: z.array(z.string()).default([]),
  /** documentation URL fragment under docs/guide/capabilities/ */
  doc: z.string().optional(),
})
export type UiMetadata = z.infer<typeof UiMetadataSchema>

export const CapabilityManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'capability id must be snake_case'),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semantic version'),
    category: CapabilityCategorySchema,
    description: z.string(),
    inputSchema: JsonSchemaObjectSchema,
    outputSchema: JsonSchemaObjectSchema,
    permissions: z.array(PermissionDeclSchema).default([]),
    secrets: z.array(SecretDeclSchema).default([]),
    ui: UiMetadataSchema,
    /** default execution timeout for one invoke, ms */
    timeoutMs: z.number().int().positive().default(30_000),
    /** hard output size cap, bytes (logs/UI truncation) */
    maxOutputBytes: z.number().int().positive().default(1_000_000),
  })
  .strict()
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>

/**
 * Capability contract: manifest + runtime adapter. `execute` throws on
 * failure (the runtime converts throws into structured tool errors); it
 * MUST NOT return raw secrets, and MUST honor `ctx.signal`.
 */
export interface CapabilityContext {
  /** resolved secret values by slot name (from the host secure store) */
  readonly secrets: Readonly<Record<string, string>>
  /** permissions granted to THIS project instance */
  readonly granted: ReadonlySet<PermissionScope>
  /** filesystem sandbox roots (generated workspace); adapters must stay inside */
  readonly sandboxRoots: readonly string[]
  /** working directory for process-type capabilities */
  readonly workdir: string
  /** env var allowlist for process-type capabilities */
  readonly envAllowlist: readonly string[]
  /** abort signal propagated from agent cancellation (P08.12) */
  readonly signal: AbortSignal
  /** ask_user bridge: renders a question in the UI and resolves with the answer (P09.20) */
  readonly askUser: (request: AskUserRequest) => Promise<AskUserAnswer>
  /** redacted logger; adapters must log through this, never console */
  readonly log: (message: string) => void
}

export interface AskUserRequest {
  kind: 'text' | 'confirm' | 'select'
  question: string
  options?: string[]
  placeholder?: string
  timeoutMs?: number
}

export interface AskUserAnswer {
  answered: boolean
  value?: string | boolean
}

export interface Capability {
  readonly manifest: CapabilityManifest
  execute(input: Record<string, unknown>, ctx: CapabilityContext): Promise<Record<string, unknown>>
}

/** Structural validation used by the registry and the test harness. */
export function validateCapability(capability: Capability): string[] {
  const problems: string[] = []
  const { manifest } = capability
  for (const secret of manifest.secrets) {
    // secret declarations must not appear as plain config properties
    if (
      manifest.inputSchema.properties &&
      secret.name in (manifest.inputSchema.properties as object)
    ) {
      problems.push(`secret "${secret.name}" must not also be an input property`)
    }
  }
  for (const perm of manifest.permissions) {
    if (
      perm.defaultGranted &&
      perm.scope === 'process' &&
      manifest.id !== 'shell' &&
      manifest.id !== 'python'
    ) {
      problems.push(`process permission default-granted for ${manifest.id} — must be explicit`)
    }
  }
  if (typeof capability.execute !== 'function') problems.push('execute must be a function')
  return problems
}
