/** Static catalog of built-in capability manifests for the renderer (P09.03). */
import type { CapabilityManifest } from '@mdt/capabilities'

// Imported at build time via the bundled registry so the renderer shows the
// same manifests the runtime enforces. Vite bundles this as plain data —
// no Node APIs are touched by the manifests themselves.
import { CapabilityRegistry, registerBuiltins } from '@mdt/capabilities'

const registry = registerBuiltins(new CapabilityRegistry())

export const capabilityCatalog: Map<string, CapabilityManifest> = new Map(
  registry.manifests().map((m) => [m.id, m]),
)
