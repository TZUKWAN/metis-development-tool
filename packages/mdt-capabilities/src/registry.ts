/**
 * Capability Registry (tasklist P09.02, P09.24).
 *
 * Holds built-in + project-installed capabilities with deterministic
 * ordering (sorted by id) and explicit version-conflict rules:
 *  - exact same id+version re-registration is a no-op (idempotent loads)
 *  - same id, different version: registration replaces only when the new
 *    version is higher; instances pinned to the replaced version keep
 *    working via the compat check (`isVersionCompatible`)
 */
import {
  CapabilityManifestSchema,
  validateCapability,
  type Capability,
  type CapabilityManifest,
} from './manifest'

export class RegistryConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryConflictError'
  }
}

export class CapabilityNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CapabilityNotFoundError'
  }
}

export interface RegistryEntry {
  readonly capability: Capability
  readonly source: 'builtin' | 'project' | 'external'
}

export interface RegisterOptions {
  source?: RegistryEntry['source']
  /** allow downgrading an existing id to a lower version (off by default) */
  allowDowngrade?: boolean
}

export class CapabilityRegistry {
  private readonly byId = new Map<string, RegistryEntry>()

  register(capability: Capability, options: RegisterOptions = {}): this {
    const problems = validateCapability(capability)
    if (problems.length > 0) {
      throw new RegistryConflictError(
        `invalid capability "${capability.manifest.id}": ${problems.join('; ')}`,
      )
    }
    // revalidate through the schema (third-party capabilities may be plain objects)
    const parsed = CapabilityManifestSchema.safeParse(capability.manifest)
    if (!parsed.success) {
      throw new RegistryConflictError(
        `manifest for "${capability.manifest.id}" rejected: ${parsed.error.issues[0]?.message}`,
      )
    }
    const existing = this.byId.get(capability.manifest.id)
    if (existing) {
      if (existing.capability.manifest.version === capability.manifest.version) {
        return this // idempotent
      }
      const incomingHigher =
        compareVersions(capability.manifest.version, existing.capability.manifest.version) > 0
      if (!incomingHigher && !options.allowDowngrade) {
        throw new RegistryConflictError(
          `capability "${capability.manifest.id}" version ${capability.manifest.version} does not replace installed ${existing.capability.manifest.version}`,
        )
      }
    }
    this.byId.set(capability.manifest.id, { capability, source: options.source ?? 'project' })
    return this
  }

  get(id: string, version?: string): Capability {
    const entry = this.byId.get(id)
    if (!entry) throw new CapabilityNotFoundError(`capability "${id}" is not registered`)
    if (version && !isVersionCompatible(entry.capability.manifest.version, version)) {
      throw new CapabilityNotFoundError(
        `capability "${id}" is registered at ${entry.capability.manifest.version}, incompatible with required ${version}`,
      )
    }
    return entry.capability
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  manifestOf(id: string): CapabilityManifest {
    return this.get(id).manifest
  }

  /** Deterministic: sorted by id. */
  list(): RegistryEntry[] {
    return [...this.byId.values()].sort((a, b) =>
      a.capability.manifest.id.localeCompare(b.capability.manifest.id),
    )
  }

  manifests(): CapabilityManifest[] {
    return this.list().map((e) => e.capability.manifest)
  }

  get size(): number {
    return this.byId.size
  }
}

/** semver comparison (major.minor.patch, no prerelease handling needed for 1.0) */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/**
 * Instance pin compatibility (P09.24): a project pinned to `^1.2.0` style
 * or exact `1.2.0` keeps its behavior when the registry holds a compatible
 * version. Major mismatch or exact-pin mismatch is incompatible.
 */
export function isVersionCompatible(available: string, pinned: string): boolean {
  if (pinned.startsWith('^')) {
    const base = pinned.slice(1)
    return compareVersions(available, base) >= 0 && available.split('.')[0] === base.split('.')[0]
  }
  return compareVersions(available, pinned) === 0
}
