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
