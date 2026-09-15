/**
 * Design thumbnails bridge (tasklist P07.03): serves the Interaction Canvas
 * with per-page render trees + content hashes so the canvas only re-rasterizes
 * pages that actually changed (dirty-page-only re-render).
 *
 * Pixel rasterization itself only works in a renderer (the offscreen Konva
 * machinery in src/renderer/export-render.tsx needs a DOM), so — like
 * `slides:get-render-slides` — this channel hands out the authoritative
 * session-derived data from the main process and lets the requesting
 * renderer do the bitmap step, caching by hash. Payload stays small: the
 * renderer downscales to ≤320px-wide JPEG (quality 0.6) before the data URL
 * ever reaches node data.
 */
import { createHash } from 'node:crypto'

import { ipcMain } from 'electron'

import { slideDurableId } from '@genoffice/pptx-engine/identity'
import type { RenderSlide } from '@genoffice/pptx-render'

import { rebuildSlide, type Session } from './session-state'

export interface DesignThumbnailEntry {
  /** slide durable id — the renderer maps it to its MDT page id */
  pageId: string
  /** slide index in the session deck */
  index: number
  /** sha1 over the rendered slide tree — the dirty-page cache key */
  hash: string
  /** rebuilt render tree to rasterize (null when the page failed to rebuild) */
  slide: RenderSlide | null
}

export type RebuildSlideFn = (session: Session, slideIndex: number) => RenderSlide | null

/**
 * Bridge: build the thumbnail batch for a slides session. When `pageIds`
 * (slide durable ids) is given, only those pages are included so callers
 * can narrow the payload. `rebuild` is injectable for tests with a stub
 * session.
 */
export function collectDesignThumbnails(
  session: Session,
  pageIds?: string[],
  rebuild: RebuildSlideFn = rebuildSlide,
): DesignThumbnailEntry[] {
  const wanted = pageIds ? new Set(pageIds) : undefined
  const entries: DesignThumbnailEntry[] = []
  session.opened.deck.slides.forEach((slide, index) => {
    const pageId = slideDurableId(slide)
    if (wanted && !wanted.has(pageId)) return
    const rendered = rebuild(session, index)
    entries.push({
      pageId,
      index,
      hash: hashRenderSlide(rendered, pageId),
      slide: rendered,
    })
  })
  return entries
}

/** Stable content hash over the render tree (page id fallback when null). */
export function hashRenderSlide(rendered: RenderSlide | null, pageId: string): string {
  return createHash('sha1')
    .update(rendered ? JSON.stringify(rendered) : `null:${pageId}`)
    .digest('hex')
}

/** Register the design-thumbnails IPC (needs the slides sessions map). */
export function registerMdtThumbnailsIpc(
  sessions: Map<number, Session>,
  rebuild: RebuildSlideFn = rebuildSlide,
): void {
  ipcMain.handle('mdt:design-thumbnails', (e, payload?: { pageIds?: string[] }) => {
    const session = sessions.get(e.sender.id)
    if (!session) return null
    return collectDesignThumbnails(session, payload?.pageIds, rebuild)
  })
}
