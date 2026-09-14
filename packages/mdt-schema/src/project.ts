/**
 * MDT project model (tasklist P04.01–P04.11).
 *
 * Single source of truth: Zod schemas in this file define the on-disk
 * project format (`mdt.project.json`), the in-memory model, and — via
 * `z.toJSONSchema` — the published JSON Schema for third-party tooling
 * (`schema/mdt-project.schema.json`, kept in sync by tests/schema-artifact).
 *
 * Identity rules (P04.12): every cross-referenced object carries a UUIDv7
 * `id` that never changes on rename/move; `name` is a human alias only.
 */
import { z } from 'zod'

import { ID_PATTERN } from './ids'
import { JsonValueSchema, JsonObjectSchema, type JsonValue } from './json'

/** MDT project schema version. Bump via a migration in `src/migrate.ts`. */
export const SCHEMA_VERSION = 1

const IdSchema = z.string().regex(ID_PATTERN, 'expected a UUIDv7 id')

/** Human-readable alias; never used as an identity. */
const NameSchema = z.string().trim().min(1).max(200)

// ---------------------------------------------------------------------------
// Element model (P04.04)
// ---------------------------------------------------------------------------

export const ElementRoleSchema = z.enum([
  'text',
  'shape',
  'image',
  'icon',
  'group',
  'button',
  'input',
  'textarea',
  'checkbox',
  'select',
  'tabs',
  'list',
  'datatable',
  'chat',
  'filepicker',
  'codeblock',
  'browserframe',
  'component',
  'form',
  'custom',
])
export type ElementRole = z.infer<typeof ElementRoleSchema>

/** Roles that can originate interactions in the Interaction Canvas. */
export const INTERACTIVE_ROLES: readonly ElementRole[] = [
  'button',
  'input',
  'textarea',
  'checkbox',
  'select',
  'tabs',
  'list',
  'datatable',
  'chat',
  'filepicker',
  'form',
]

export const GeometrySchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number().optional(),
})
export type Geometry = z.infer<typeof GeometrySchema>

/**
 * Adapter-owned visual payload. `mdt-design` maps this to/from the
 * GenOffice pptx model; the schema validates structure, not design details.
 */
export const VisualSchema = z.object({
  kind: z.string().min(1),
  geometry: GeometrySchema,
  /** visual style tokens (fill, stroke, font, …) — adapter-defined keys */
  style: JsonObjectSchema,
  /** kind-specific properties — adapter-defined, JSON-serializable */
  props: JsonObjectSchema,
})
export type Visual = z.infer<typeof VisualSchema>

export const AccessibilitySchema = z.object({
  label: z.string().optional(),
  describedBy: z.string().optional(),
  tabIndex: z.number().int().optional(),
})

export const ElementSemanticsSchema = z.object({
  /** accessible/semantic name (defaults to `name`) */
  label: z.string().optional(),
  placeholder: z.string().optional(),
  /** for checkbox/select/tabs: option list */
  options: z.array(z.string()).optional(),
  defaultValue: JsonValueSchema.optional(),
  /** accept attribute for filepicker, e.g. ".txt,.md" */
  accept: z.string().optional(),
  multiple: z.boolean().optional(),
  /** interaction source handles published by this element */
  handles: z.array(z.string()).default([]),
  /** component instance: reference to the source Component */
  componentRef: IdSchema.optional(),
  /** per-instance overrides on top of the source component (property path → value) */
  overrides: z.record(z.string(), JsonValueSchema).optional(),
  /** Chat bound to an agent */
  agentRef: IdSchema.optional(),
  /** element-bound data source (DataTable/List), e.g. a binding id */
  bindingRef: IdSchema.optional(),
  /** URL for browserframe; http/https only, validated by lint (P06.26) */
  url: z.string().optional(),
  accessibility: AccessibilitySchema.optional(),
})
export type ElementSemantics = z.infer<typeof ElementSemanticsSchema>

export interface Element {
  id: string
  name: string
  role: ElementRole
  visual: Visual
  semantics: ElementSemantics
  locked: boolean
  hidden: boolean
  children: Element[]
}

/**
 * Recursive element tree — `children` models GenOffice groups so grouping
 * never severs semantics (P06.13).
 */
export const ElementSchema: z.ZodType<Element> = z.lazy(() =>
  z.object({
    id: IdSchema,
    name: NameSchema,
    role: ElementRoleSchema,
    visual: VisualSchema,
    semantics: ElementSemanticsSchema.default({ handles: [] }),
    locked: z.boolean().default(false),
    hidden: z.boolean().default(false),
    children: z.array(z.lazy(() => ElementSchema)).default([]),
  }),
) as z.ZodType<Element>

// ---------------------------------------------------------------------------
// Page model (P04.03)
// ---------------------------------------------------------------------------

export const PageTypeSchema = z.enum(['page', 'modal', 'drawer', 'popover', 'component'])
export type PageType = z.infer<typeof PageTypeSchema>

export const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** preset name such as desktop-1440 / tablet-1024 / mobile-390 */
  preset: z.string().optional(),
})

export const PageMetadataSchema = z.object({
  /** interaction-canvas node position (pure UI state, P07.04) */
  canvasPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  /** drawer side (P06.05) */
  drawerSide: z.enum(['left', 'right']).optional(),
  /** popover anchor behavior (P06.06) */
  popoverAnchor: z.enum(['element', 'position']).optional(),
  popoverAnchorElementId: IdSchema.optional(),
  /** modal dismissible by backdrop click (P06.04) */
  modalDismissible: z.boolean().optional(),
  notes: z.string().optional(),
})

export interface Page {
  id: string
  name: string
  type: PageType
  viewport: z.infer<typeof ViewportSchema>
  background: { [k: string]: JsonValue }
  elements: Element[]
  metadata: z.infer<typeof PageMetadataSchema>
}

export const PageSchema: z.ZodType<Page> = z.lazy(() =>
  z.object({
    id: IdSchema,
    name: NameSchema,
    type: PageTypeSchema,
    viewport: ViewportSchema,
    background: JsonObjectSchema.default({}),
    elements: z.array(ElementSchema).default([]),
    metadata: PageMetadataSchema.default({}),
  }),
) as z.ZodType<Page>

// ---------------------------------------------------------------------------
// Component model (P04.05)
// ---------------------------------------------------------------------------

export interface Component {
  id: string
  name: string
  description: string
  elements: Element[]
}

export const ComponentSchema: z.ZodType<Component> = z.lazy(() =>
  z.object({
    id: IdSchema,
    name: NameSchema,
    description: z.string().default(''),
    /** internal element tree; instances reference the whole tree via componentRef */
    elements: z.array(ElementSchema).default([]),
  }),
) as z.ZodType<Component>

// ---------------------------------------------------------------------------
// Agent model (P04.06) — never contains provider secrets
// ---------------------------------------------------------------------------

export const ModelPolicySchema = z
  .object({
    /** provider key, e.g. "openai" or a custom OpenAI-compatible endpoint id */
    provider: z.string().min(1),
    model: z.string().min(1),
    /** base URL for OpenAI-compatible custom endpoints */
    baseUrl: z.string().url().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    /** which API shape the endpoint speaks (drives runtime compat flags) */
    api: z
      .enum(['openai-completions', 'openai-responses', 'anthropic-messages', 'google-gemini'])
      .default('openai-completions'),
    /** endpoint quirk overrides forwarded to the runtime */
    compat: z
      .object({
        supportsDeveloperRole: z.boolean().optional(),
        supportsReasoningEffort: z.boolean().optional(),
        supportsStrictMode: z.boolean().optional(),
      })
      .optional(),
  })
  // strict: an apiKey typed into a project file must be a schema error, not
  // a silently-stripped field (P04.06: no provider secrets in the schema)
  .strict()
export type ModelPolicy = z.infer<typeof ModelPolicySchema>

export const AgentSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  description: z.string().default(''),
  /** system instructions (P08.04) */
  instructions: z.string().default(''),
  modelPolicy: ModelPolicySchema,
  /** capability instance ids assigned to this agent (P08.07) */
  capabilityRefs: z.array(IdSchema).default([]),
  memory: z
    .object({
      enabled: z.boolean().default(false),
      /** session-scoped transcript limit in turns */
      maxTurns: z.number().int().positive().optional(),
    })
    .default({ enabled: false }),
  /** at most one agent per project has isDefault (enforced by validator) */
  isDefault: z.boolean().default(false),
})
export type Agent = z.infer<typeof AgentSchema>

// ---------------------------------------------------------------------------
// Capability references (P04.07) — config refs only, secrets by reference
// ---------------------------------------------------------------------------

export const SECRET_REF_PATTERN = /^\$\{secret:[A-Za-z0-9_.-]+\}$/

export const PermissionGrantSchema = z.object({
  /** network | filesystem | process | browser | user-interaction */
  scope: z.enum(['network', 'filesystem', 'process', 'browser', 'user-interaction']),
  /** narrowed grant, e.g. allowed hosts, sandbox roots, executable */
  detail: z.string().optional(),
  /** user explicitly granted this at insert/inspect time */
  granted: z.boolean().default(false),
})
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>

export const CapabilityInstanceSchema = z.object({
  /** instance id inside this project (uuid) */
  id: IdSchema,
  /** registry id, e.g. "web_fetch" */
  capabilityId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** registry version this instance pins */
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  /** schema-validated config (validated against the manifest at build/inspect time) */
  config: JsonObjectSchema.default({}),
  /** secret slot name → secret reference (never a raw secret) */
  secrets: z.record(z.string(), z.string().regex(SECRET_REF_PATTERN)).default({}),
  permissions: z.array(PermissionGrantSchema).default([]),
})
export type CapabilityInstance = z.infer<typeof CapabilityInstanceSchema>

// ---------------------------------------------------------------------------
// Interactions (P04.08) — triggers + discriminated-union actions
// ---------------------------------------------------------------------------

export const TriggerSchema = z.enum(['click', 'dblclick', 'change', 'submit', 'load'])
export type Trigger = z.infer<typeof TriggerSchema>

export const BindingSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('elementValue'), elementId: IdSchema }),
  z.object({ type: z.literal('literal'), value: JsonValueSchema }),
  z.object({ type: z.literal('variable'), variableId: IdSchema }),
  z.object({ type: z.literal('agentOutput'), agentId: IdSchema }),
  z.object({ type: z.literal('capabilityOutput'), capabilityInstanceId: IdSchema }),
])
export type BindingSource = z.infer<typeof BindingSourceSchema>

const InteractionBase = {
  id: IdSchema,
  /** page that hosts the trigger */
  sourcePageId: IdSchema,
  /** element that owns the trigger (absent for page-level `load`) */
  sourceElementId: IdSchema.optional(),
  /** named handle on the element (defaults to the element's primary handle) */
  sourceHandle: z.string().optional(),
  trigger: TriggerSchema,
  condition: z.string().optional(),
  enabled: z.boolean().default(true),
}

export const InteractionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), targetPageId: IdSchema }),
  z.object({ type: z.literal('openModal'), targetPageId: IdSchema }),
  z.object({ type: z.literal('openDrawer'), targetPageId: IdSchema }),
  /** close the hosting overlay; targetPageId narrows to a specific overlay */
  z.object({ type: z.literal('close'), targetPageId: IdSchema.optional() }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('toggleVisibility'), targetElementId: IdSchema }),
  z.object({ type: z.literal('submit'), formElementId: IdSchema.optional() }),
  z.object({
    type: z.literal('sendToAgent'),
    agentId: IdSchema,
    payload: BindingSourceSchema,
    /** chat element that displays the conversation */
    chatElementId: IdSchema.optional(),
  }),
  z.object({
    type: z.literal('invokeCapability'),
    capabilityInstanceId: IdSchema,
    /** argument name → value source (schema-checked against the manifest) */
    args: z.record(z.string(), BindingSourceSchema).default({}),
    /** optional result binding target */
    resultElementId: IdSchema.optional(),
  }),
  z.object({
    type: z.literal('setVariable'),
    variableId: IdSchema,
    value: BindingSourceSchema,
  }),
  z.object({
    type: z.literal('bindOutput'),
    /** source of the output */
    source: z.discriminatedUnion('type', [
      z.object({ type: z.literal('agentOutput'), agentId: IdSchema }),
      z.object({ type: z.literal('capabilityOutput'), capabilityInstanceId: IdSchema }),
    ]),
    targetElementId: IdSchema,
    /** target property on the element, e.g. "text" | "items" | "chat" */
    property: z.string().min(1),
  }),
])
export type InteractionAction = z.infer<typeof InteractionActionSchema>

export const InteractionSchema = z.object({
  ...InteractionBase,
  action: InteractionActionSchema,
})
export type Interaction = z.infer<typeof InteractionSchema>

// ---------------------------------------------------------------------------
// Data bindings (P04.09)
// ---------------------------------------------------------------------------

export const DataBindingSchema = z.object({
  id: IdSchema,
  source: BindingSourceSchema,
  target: z.object({
    elementId: IdSchema,
    /** target property, e.g. "text" | "items" | "value" | "chat" */
    property: z.string().min(1),
  }),
})
export type DataBinding = z.infer<typeof DataBindingSchema>

// ---------------------------------------------------------------------------
// Variables (P04.10)
// ---------------------------------------------------------------------------

export const VariableScopeSchema = z.enum(['project', 'page', 'session'])
export const VariableTypeSchema = z.enum(['string', 'number', 'boolean', 'json'])

export const VariableSchema = z
  .object({
    id: IdSchema,
    name: NameSchema,
    scope: VariableScopeSchema,
    /** required for page-scoped variables */
    pageId: IdSchema.optional(),
    type: VariableTypeSchema,
    defaultValue: JsonValueSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'page' && !v.pageId) {
      ctx.issues.push({
        code: 'custom',
        message: 'page-scoped variable requires pageId',
        input: v,
        path: ['pageId'],
      })
    }
    const d = v.defaultValue
    if (d === undefined) return
    const ok =
      v.type === 'string'
        ? typeof d === 'string'
        : v.type === 'number'
          ? typeof d === 'number'
          : v.type === 'boolean'
            ? typeof d === 'boolean'
            : true // json accepts any JSON value
    if (!ok) {
      ctx.issues.push({
        code: 'custom',
        message: `defaultValue does not match declared type ${v.type}`,
        input: v,
        path: ['defaultValue'],
      })
    }
  })
export type Variable = z.infer<typeof VariableSchema>

// ---------------------------------------------------------------------------
// Assets (P04.11)
// ---------------------------------------------------------------------------

export const AssetSchema = z.object({
  id: IdSchema,
  /** project-relative path, e.g. "assets/<sha256>.png" — never absolute */
  path: z
    .string()
    .regex(/^assets\/[A-Za-z0-9._/-]+$/)
    .refine((p) => !p.includes('..'), 'asset path must not traverse'),
  mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  originalName: z.string(),
})
export type Asset = z.infer<typeof AssetSchema>

// ---------------------------------------------------------------------------
// Settings & ProjectRoot (P04.01, P04.02)
// ---------------------------------------------------------------------------

export const ThemeSchema = z.object({
  colors: z.record(z.string(), z.string()).default({}),
  fonts: z.record(z.string(), z.string()).default({}),
})

export const ViewportPresetSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const SettingsSchema = z.object({
  theme: ThemeSchema.default({ colors: {}, fonts: {} }),
  viewportPresets: z.array(ViewportPresetSchema).default([
    { name: 'desktop-1440', width: 1440, height: 1024 },
    { name: 'tablet-1024', width: 1024, height: 1366 },
    { name: 'mobile-390', width: 390, height: 844 },
  ]),
  defaultAgentId: IdSchema.optional(),
  locale: z.string().default('en'),
  generator: z
    .object({
      target: z.literal('web-agent').default('web-agent'),
      /** npm dependency pins the generator applies verbatim */
      dependencyOverrides: z.record(z.string(), z.string()).default({}),
    })
    .default({ target: 'web-agent', dependencyOverrides: {} }),
})
export type Settings = z.infer<typeof SettingsSchema>

export type ProjectRoot = z.infer<typeof ProjectRootSchema>

export const ProjectRootSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdSchema,
  name: NameSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  pages: z.array(PageSchema).default([]),
  components: z.array(ComponentSchema).default([]),
  agents: z.array(AgentSchema).default([]),
  /** capability instances used by this project (registry lives outside) */
  capabilities: z.array(CapabilityInstanceSchema).default([]),
  interactions: z.array(InteractionSchema).default([]),
  bindings: z.array(DataBindingSchema).default([]),
  variables: z.array(VariableSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  settings: SettingsSchema.default({
    theme: { colors: {}, fonts: {} },
    viewportPresets: [
      { name: 'desktop-1440', width: 1440, height: 1024 },
      { name: 'tablet-1024', width: 1024, height: 1366 },
      { name: 'mobile-390', width: 390, height: 844 },
    ],
    locale: 'en',
    generator: { target: 'web-agent', dependencyOverrides: {} },
  }),
})
