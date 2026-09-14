import { beforeEach, describe, expect, it } from 'vitest'

import {
  VariableStore,
  pageVariables,
  projectVariables,
  registerVariables,
  sessionVariables,
  storeForScope,
  type VariableDefinition,
} from '../../src/variables'

/** Deterministic in-memory Storage stand-in for localStorage. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'clear'> & {
  dump: () => Map<string, string>
} {
  const backing = new Map<string, string>()
  return {
    clear: () => backing.clear(),
    getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key: string, value: string) => void backing.set(key, value),
    dump: () => backing,
  }
}

function def(overrides: Partial<VariableDefinition> = {}): VariableDefinition {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    name: 'Query',
    scope: 'session',
    type: 'string',
    defaultValue: 'hello',
    ...overrides,
  }
}

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  projectVariables.clear()
  sessionVariables.clear()
  pageVariables.clear()
})

describe('variable stores', () => {
  it('registers defaults for every scope', () => {
    const store = new VariableStore('session', storage)
    store.register(def({ defaultValue: 'b' }))
    expect(store.get(def().id)).toBe('b')
  })

  it('persists project scope into localStorage', () => {
    const store = new VariableStore('project', storage)
    const definition = def({ id: 'v-project', scope: 'project', defaultValue: 'a' })
    store.register(definition)
    store.set('v-project', 'updated')
    expect(storage.dump().get('mdt:var:project:v-project')).toBe(JSON.stringify('updated'))
  })

  it('persists session scope into localStorage', () => {
    const store = new VariableStore('session', storage)
    store.register(def({ id: 'v-session', defaultValue: 'b' }))
    store.set('v-session', 42)
    expect(storage.dump().get('mdt:var:session:v-session')).toBe('42')
  })

  it('keeps page scope in memory only', () => {
    const store = new VariableStore('page', storage)
    store.register(def({ id: 'v-page', scope: 'page', defaultValue: 'c' }))
    store.set('v-page', 'temp')
    expect(storage.dump().size).toBe(0)
    expect(store.get('v-page')).toBe('temp')
  })

  it('seeds from storage before falling back to the default', () => {
    storage.setItem('mdt:var:session:v-session', JSON.stringify('persisted'))
    const store = new VariableStore('session', storage)
    store.register(def({ id: 'v-session', defaultValue: 'fresh' }))
    expect(store.get('v-session')).toBe('persisted')
  })

  it('falls back to in-memory when localStorage is unusable', () => {
    const broken = { getItem: 'nope', setItem: 42 } as unknown as Storage
    const store = new VariableStore('project', broken)
    store.register(def({ id: 'v-broken', defaultValue: 'mem' }))
    store.set('v-broken', 'still-mem')
    expect(store.get('v-broken')).toBe('still-mem')
  })

  it('notifies subscribers on set and supports unsubscribe', () => {
    const store = new VariableStore('session', storage)
    store.register(def({ id: 'v-session', defaultValue: 'x' }))
    const events: number[] = []
    const unsubscribe = store.subscribe(() => events.push(1))
    store.set('v-session', 'y')
    unsubscribe()
    store.set('v-session', 'z')
    expect(events).toEqual([1])
  })

  it('global scope stores share the documented persistence semantics', () => {
    registerVariables([
      def({ id: 'v-project', scope: 'project', defaultValue: 'a' }),
      def({ id: 'v-session', scope: 'session', defaultValue: 'b' }),
      def({ id: 'v-page', scope: 'page', defaultValue: 'c' }),
    ])
    expect(projectVariables.get('v-project')).toBe('a')
    expect(sessionVariables.get('v-session')).toBe('b')
    expect(pageVariables.get('v-page')).toBe('c')
    expect(storeForScope('project')).toBe(projectVariables)
    expect(storeForScope('session')).toBe(sessionVariables)
    expect(storeForScope('page')).toBe(pageVariables)
  })
})
