/**
 * registry tests: deterministic ordering, idempotent same-version loads,
 * downgrade rejection, version compat matrix, invalid-manifest rejection,
 * builtin registration and the index.ts public surface.
 */
import { describe, expect, it } from 'vitest'

import { builtinCapabilities, registerBuiltins } from '../src/builtins'
import type { Capability } from '../src/manifest'
import { validateCapability } from '../src/manifest'
import { CapabilityNotFoundError, CapabilityRegistry, compareVersions, isVersionCompatible, RegistryConflictError } from '../src/registry'
import * as publicApi from '../src/index'

function makeCapability(id: string, version = '1.0.0'): Capability {
  return {
    manifest: {
      id,
      name: `Dummy ${id}`,
      version,
      category: 'data',
      description: 'test-only dummy capability',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      outputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      permissions: [],
      secrets: [],
      ui: { icon: 'x', accent: '#ffffff', summary: 'dummy', keywords: [] },
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
    },
    async execute() {
      return {}
    },
  }
}

describe('registry semantics', () => {
  it('re-registering the same id+version is an idempotent no-op', () => {
    const registry = new CapabilityRegistry()
    registry.register(makeCapability('dummy_a'))
    const first = registry.get('dummy_a')
    registry.register(makeCapability('dummy_a'), { source: 'project' })
    expect(registry.get('dummy_a')).toBe(first)
    expect(registry.size).toBe(1)
  })

  it('a higher version replaces the installed one', () => {
    const registry = new CapabilityRegistry()
    registry.register(makeCapability('dummy_b', '1.0.0'))
    registry.register(makeCapability('dummy_b', '1.1.0'))
    expect(registry.manifestOf('dummy_b').version).toBe('1.1.0')
  })

  it('rejects downgrades unless allowDowngrade is set', () => {
    const registry = new CapabilityRegistry()
    registry.register(makeCapability('dummy_c', '1.1.0'))
    expect(() => registry.register(makeCapability('dummy_c', '1.0.0'))).toThrow(RegistryConflictError)
    registry.register(makeCapability('dummy_c', '1.0.0'), { allowDowngrade: true })
    expect(registry.manifestOf('dummy_c').version).toBe('1.0.0')
  })

  it('rejects invalid manifests with RegistryConflictError', () => {
    const registry = new CapabilityRegistry()
    // secret name colliding with an input property (validateCapability)
    const colliding = makeCapability('dummy_d')
    colliding.manifest.secrets = [{ name: 'alpha', description: 'dup', required: true }]
    ;(colliding.manifest.inputSchema.properties as Record<string, unknown>).alpha = { type: 'string' }
    expect(() => registry.register(colliding)).toThrow(RegistryConflictError)
    // manifest failing the zod schema (id must be snake_case)
    const badId = makeCapability('NotSnakeCase')
    expect(() => registry.register(badId)).toThrow(RegistryConflictError)
  })

  it('rejects process permissions that are default-granted (except shell/python)', () => {
    const registry = new CapabilityRegistry()
    const sneaky = makeCapability('dummy_process')
    sneaky.manifest.permissions = [{ scope: 'process', detail: 'sneaky', required: true, defaultGranted: true }]
    expect(() => registry.register(sneaky)).toThrow(/process permission default-granted/)
  })

  it('throws CapabilityNotFoundError for unknown ids and incompatible pins', () => {
    const registry = new CapabilityRegistry()
    expect(() => registry.get('nope')).toThrow(CapabilityNotFoundError)
    registry.register(makeCapability('dummy_e', '1.0.0'))
    expect(() => registry.get('dummy_e', '2.0.0')).toThrow(CapabilityNotFoundError)
    expect(registry.get('dummy_e', '1.0.0')).toBeDefined()
    expect(registry.has('dummy_e')).toBe(true)
    expect(registry.has('nope')).toBe(false)
  })
})

describe('version compatibility matrix', () => {
  it('caret pins stay within the same major', () => {
    expect(isVersionCompatible('1.2.0', '^1.2.0')).toBe(true)
    expect(isVersionCompatible('1.9.9', '^1.2.0')).toBe(true)
    expect(isVersionCompatible('2.0.0', '^1.2.0')).toBe(false)
    expect(isVersionCompatible('1.1.9', '^1.2.0')).toBe(false)
  })

  it('exact pins require exact equality', () => {
    expect(isVersionCompatible('1.2.3', '1.2.3')).toBe(true)
    expect(isVersionCompatible('1.2.4', '1.2.3')).toBe(false)
  })

  it('compareVersions orders numerically (not lexically)', () => {
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })
})

describe('builtins', () => {
  it('registers all 13 built-ins with source builtin', () => {
    const registry = registerBuiltins(new CapabilityRegistry())
    expect(registry.size).toBe(13)
    expect(builtinCapabilities).toHaveLength(13)
    const ids = registry.list().map((e) => e.capability.manifest.id)
    expect(ids).toEqual([
      'ask_user',
      'browser',
      'datetime',
      'file_list',
      'file_read',
      'file_write',
      'http_request',
      'json',
      'mcp',
      'python',
      'shell',
      'web_fetch',
      'web_search',
    ])
    expect(registry.list().every((e) => e.source === 'builtin')).toBe(true)
  })

  it('is deterministic across registries', () => {
    const a = registerBuiltins(new CapabilityRegistry()).list().map((e) => e.capability.manifest.id)
    const b = registerBuiltins(new CapabilityRegistry()).list().map((e) => e.capability.manifest.id)
    expect(a).toEqual(b)
  })

  it('every builtin passes structural validation and is idempotent on reload', () => {
    for (const capability of builtinCapabilities) {
      expect(validateCapability(capability)).toEqual([])
    }
    const registry = registerBuiltins(new CapabilityRegistry())
    expect(() => registerBuiltins(registry)).not.toThrow()
    expect(registry.size).toBe(13)
  })

  it('high-risk capabilities are default-denied', () => {
    for (const id of ['shell', 'python', 'mcp', 'browser', 'file_read', 'file_write', 'file_list']) {
      const capability = builtinCapabilities.find((c) => c.manifest.id === id)
      expect(capability, id).toBeDefined()
      for (const perm of capability?.manifest.permissions ?? []) {
        expect(perm.defaultGranted, `${id}:${perm.scope}`).toBe(false)
      }
    }
  })
})

describe('index.ts public surface', () => {
  it('re-exports the manifest, context, registry, guards, paths, testing and builtins', () => {
    expect(typeof publicApi.registerBuiltins).toBe('function')
    expect(publicApi.datetimeCapability).toBeDefined()
    expect(publicApi.jsonCapability).toBeDefined()
    expect(publicApi.askUserCapability).toBeDefined()
    expect(typeof publicApi.createCapabilityContext).toBe('function')
    expect(typeof publicApi.requirePermission).toBe('function')
    expect(typeof publicApi.redact).toBe('function')
    expect(typeof publicApi.CapabilityRegistry).toBe('function')
    expect(typeof publicApi.isVersionCompatible).toBe('function')
    expect(typeof publicApi.assertUrlAllowed).toBe('function')
    expect(typeof publicApi.assertUrlAllowedAsync).toBe('function')
    expect(typeof publicApi.UrlBlockedError).toBe('function')
    expect(typeof publicApi.resolveInSandbox).toBe('function')
    expect(typeof publicApi.PathEscapeError).toBe('function')
    expect(typeof publicApi.runCapabilityContractTests).toBe('function')
    expect(publicApi.CapabilityManifestSchema).toBeDefined()
    expect(publicApi.queryPath).toBeDefined()
  })
})
