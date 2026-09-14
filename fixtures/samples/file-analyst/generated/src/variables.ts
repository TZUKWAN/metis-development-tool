/**
 * MDT variable stores (P04.10 semantics in the generated app):
 *  - project scope → localStorage (`mdt:var:project:`), survives reloads
 *  - session scope → localStorage (`mdt:var:session:`), per browser profile
 *  - page scope    → in-memory only, reset on reload
 * All stores are tiny observable maps so React pages can subscribe.
 */

export type VariableScope = 'project' | 'page' | 'session'

export interface VariableDefinition {
  id: string
  name: string
  scope: VariableScope
  pageId?: string
  type: 'string' | 'number' | 'boolean' | 'json'
  defaultValue?: unknown
}

export type VariableListener = () => void

const PREFIX: Record<VariableScope, string> = {
  project: 'mdt:var:project:',
  session: 'mdt:var:session:',
  page: 'mdt:var:page:',
}

/** localStorage can hold only strings — JSON round-trip everything else. */
function usableStorage(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
): Pick<Storage, 'getItem' | 'setItem'> | null {
  return storage !== null &&
    storage !== undefined &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function'
    ? storage
    : null
}

export class VariableStore {
  private readonly values = new Map<string, unknown>()
  private readonly listeners = new Set<VariableListener>()
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null

  constructor(
    private readonly scope: VariableScope,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null =
      typeof window === 'undefined' ? null : window.localStorage,
  ) {
    this.storage = usableStorage(storage)
  }

  /** Seed from storage once; missing keys fall back to the default value. */
  register(definition: VariableDefinition): void {
    if (this.values.has(definition.id)) return
    const stored = this.readStored(definition.id)
    if (stored.found) {
      this.values.set(definition.id, stored.value)
    } else {
      this.values.set(definition.id, definition.defaultValue ?? null)
    }
  }

  private readStored(id: string): { found: boolean; value?: unknown } {
    if (this.scope === 'page' || this.storage === null) return { found: false }
    try {
      const raw = this.storage.getItem(PREFIX[this.scope] + id)
      if (raw === null) return { found: false }
      return { found: true, value: JSON.parse(raw) as unknown }
    } catch {
      return { found: false }
    }
  }

  get(id: string): unknown {
    return this.values.get(id) ?? null
  }

  set(id: string, value: unknown): void {
    this.values.set(id, value)
    if (this.scope !== 'page' && this.storage !== null) {
      try {
        this.storage.setItem(PREFIX[this.scope] + id, JSON.stringify(value ?? null))
      } catch {
        // ignore persistence failures; memory state remains authoritative
      }
    }
    for (const listener of this.listeners) listener()
  }

  subscribe(listener: VariableListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Test helper. */
  clear(): void {
    this.values.clear()
    this.listeners.clear()
  }
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

/** Project-scoped store (localStorage-backed). */
export const projectVariables = new VariableStore('project', browserStorage())
/** Session-scoped store (localStorage-backed per the MDT persistence contract). */
export const sessionVariables = new VariableStore('session', browserStorage())
/** Page-scoped store (in-memory, resets on reload). */
export const pageVariables = new VariableStore('page', null)

export function storeForScope(scope: VariableScope): VariableStore {
  if (scope === 'project') return projectVariables
  if (scope === 'session') return sessionVariables
  return pageVariables
}

/** Register all project variable definitions into their scope stores. */
export function registerVariables(definitions: VariableDefinition[]): void {
  for (const definition of definitions) storeForScope(definition.scope).register(definition)
}
