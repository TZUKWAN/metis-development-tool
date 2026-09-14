/**
 * Capability catalog for the renderer (P09.03/P09.04).
 *
 * Manifests arrive via IPC from the main-process registry — the renderer
 * never bundles the capability adapters (they use Node APIs).
 */
import { useEffect, useState } from 'react'

import type { CapabilityManifest } from '@mdt/capabilities'

/** Manifests fetched from the registry over IPC (main process). */
export function useCapabilityCatalog(): Map<string, CapabilityManifest> {
  const [catalog, setCatalog] = useState<Map<string, CapabilityManifest>>(new Map())
  useEffect(() => {
    let cancelled = false
    void window.mdtApi?.capabilityList().then((r) => {
      const payload = r as { manifests?: CapabilityManifest[] }
      if (!cancelled && payload.manifests) {
        setCatalog(new Map(payload.manifests.map((m) => [m.id, m])))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return catalog
}
