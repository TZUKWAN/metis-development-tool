import { describe, expect, it } from 'vitest'

import { resolveSource, type ResolveContext } from '../../src/bindings'
import { registerVariables, type VariableDefinition } from '../../src/variables'

const variables: VariableDefinition[] = [
  { id: 'var-1', name: 'Name', scope: 'session', type: 'string', defaultValue: 'ada' },
]

registerVariables(variables)

const ctx: ResolveContext = {
  values: { 'el-input': 'typed text' },
  variables,
  agentOutputs: { 'agent-1': 'final answer' },
  capabilityOutputs: { 'cap-1': { result: 7 } },
}

describe('binding resolver', () => {
  it('resolves elementValue sources from page state', () => {
    expect(resolveSource({ type: 'elementValue', elementId: 'el-input' }, ctx)).toBe('typed text')
  })

  it('resolves literal sources verbatim', () => {
    expect(resolveSource({ type: 'literal', value: 3 }, ctx)).toBe(3)
  })

  it('resolves variable sources through the scope store', () => {
    expect(resolveSource({ type: 'variable', variableId: 'var-1' }, ctx)).toBe('ada')
  })

  it('resolves agentOutput sources to the last response', () => {
    expect(resolveSource({ type: 'agentOutput', agentId: 'agent-1' }, ctx)).toBe('final answer')
  })

  it('resolves capabilityOutput sources to the last result', () => {
    expect(resolveSource({ type: 'capabilityOutput', capabilityInstanceId: 'cap-1' }, ctx)).toEqual({
      result: 7,
    })
  })

  it('returns null-ish defaults for unknown ids instead of throwing', () => {
    expect(resolveSource({ type: 'elementValue', elementId: 'missing' }, ctx)).toBe('')
    expect(resolveSource({ type: 'variable', variableId: 'missing' }, ctx)).toBeNull()
  })
})
