/**
 * Deck → MDT store sync (tasklist P06): subscribes to the deck-changed
 * broadcast, fetches the authoritative DesignPageRefs, and feeds the MDT
 * project store. Mounted once by the MDT dock.
 */
import { useEffect } from 'react'

import { useMdtStore } from './store'

export function useDeckSync(): void {
  const syncFromDesign = useMdtStore((s) => s.syncFromDesign)
  const project = useMdtStore((s) => s.project)

  useEffect(() => {
    if (!project) return
    let alive = true
    const pull = (): void => {
      void window.mdtApi
        ?.designSlides()
        .then((r) => {
          const slides = r as Parameters<typeof syncFromDesign>[0] | null
          if (alive && slides) syncFromDesign(slides)
        })
        .catch(() => {})
    }
    pull()
    const off = window.slidesApi?.onDeckChanged(() => pull())
    return () => {
      alive = false
      off?.()
    }
  }, [project, syncFromDesign])
}
