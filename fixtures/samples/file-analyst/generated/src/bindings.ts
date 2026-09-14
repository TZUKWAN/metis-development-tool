/**
 * Binding resolver helpers (P04.09): turn a MDT BindingSource into a concrete
 * value given the current page state. The generated `generated-bindings.ts`
 * module supplies the id tables; pages call `resolveSource` inside render.
 */
import { storeForScope, type VariableDefinition } from './variables'

/** Element values observed on the current page (elementId → value). */
export type ElementValues = Record<string, unknown>

export type BindingSource =
  | { type: 'elementValue'; elementId: string }
  | { type: 'literal'; value: unknown }
  | { type: 'variable'; variableId: string }
  | { type: 'agentOutput'; agentId: string }
  | { type: 'capabilityOutput'; capabilityInstanceId: string }

export interface ResolveContext {
  values: ElementValues
  variables: VariableDefinition[]
  /** last response text per agent id (updated after each run_end) */
  agentOutputs: Record<string, string>
  /** last result per capability instance id */
  capabilityOutputs: Record<string, unknown>
}

export function resolveSource(source: BindingSource, ctx: ResolveContext): unknown {
  switch (source.type) {
    case 'elementValue':
      return ctx.values[source.elementId] ?? ''
    case 'literal':
      return source.value
    case 'variable': {
      const definition = ctx.variables.find((v) => v.id === source.variableId)
      if (!definition) return null
      return storeForScope(definition.scope).get(source.variableId)
    }
    case 'agentOutput':
      return ctx.agentOutputs[source.agentId] ?? ''
    case 'capabilityOutput':
      return ctx.capabilityOutputs[source.capabilityInstanceId] ?? null
    default:
      return null
  }
}

/** Coerce an unknown binding value into a renderable list. */
export function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) return parsed
    } catch {
      // plain string: render as a single row
    }
    return [value]
  }
  return []
}

/** Coerce an unknown binding value into renderable table rows. */
export function toArrayRecords(value: unknown): Record<string, unknown>[] {
  return toArray(value).filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  )
}
