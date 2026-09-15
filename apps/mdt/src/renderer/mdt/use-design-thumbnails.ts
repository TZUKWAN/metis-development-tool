/**
 * Interaction-canvas page thumbnails (tasklist P07.03).
 *
 * The main process (`mdt:design-thumbnails`) serves each open page's render
 * tree plus a content hash; this hook does the bitmap step in the renderer
 * with the SAME offscreen machinery the deck export uses
 * (`renderSlidesToPngBase64`), downscales to a 320px-wide JPEG (quality
 * 0.6) and caches by hash — so a deck-changed broadcast only re-rasterizes
 * pages whose content actually changed.
 */
import { useEffect, useState } from 'react'

import type { RenderFill, RenderNode, RenderSlide } from '@genoffice/pptx-render'

import { renderSlidesToPngBase64 } from '../export-render'
import { useMdtStore } from './store'

/** Thumbnail width cap — keeps node data URLs small. */
const THUMB_WIDTH_PX = 320
const THUMB_JPEG_QUALITY = 0.6

interface ThumbnailEntry {
  pageId: string
  index: number
  hash: string
  slide: RenderSlide | null
}

/** hash → rendered data URL; survives deck changes (content-addressed). */
const thumbByHash = new Map<string, string>()
/** Serializes refreshes so a burst of deck-changed broadcasts cannot pile up raster work. */
let refreshTail: Promise<unknown> = Promise.resolve()

export type ThumbnailMap = ReadonlyMap<string, string>

/** Collect every image data URL a slide's render tree references. */
export function collectSlideImageUrls(slide: RenderSlide): Set<string> {
  const urls = new Set<string>()
  const addFillUrl = (fill: RenderFill | undefined): void => {
    if (fill && fill.kind === 'image' && fill.dataUrl) urls.add(fill.dataUrl)
  }
  const addBulletUrls = (text: { lines: Array<{ runs: Array<{ image?: string }> }> }): void => {
    for (const l of text?.lines ?? []) for (const r of l.runs) if (r.image) urls.add(r.image)
  }
  const walk = (nodes: readonly RenderNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'picture' && n.dataUrl) urls.add(n.dataUrl)
      if (n.type === 'shape' || n.type === 'text') {
        if (n.fill) addFillUrl(n.fill)
        if (n.text) addBulletUrls(n.text)
      }
      if (n.type === 'chart') addFillUrl((n as { bgFill?: RenderFill }).bgFill)
      if (n.type === 'group' && Array.isArray(n.children)) walk(n.children)
      if (n.type === 'table' && Array.isArray(n.cells)) {
        for (const c of n.cells) {
          if (c.fill) addFillUrl(c.fill)
          if (c.text) addBulletUrls(c.text)
        }
      }
    }
  }
  addFillUrl(slide.background)
  walk(slide.nodes)
  return urls
}

function decodeImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function decodeSlideImages(slide: RenderSlide): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...collectSlideImageUrls(slide)].map(async (url) => {
      const img = await decodeImage(url)
      if (img) map.set(url, img)
    }),
  )
  return map
}

/** Rasterize one render tree to a small JPEG data URL (flattened on white). */
export async function rasterizeThumbnail(slide: RenderSlide): Promise<string> {
  const ratio = Math.min(THUMB_WIDTH_PX / Math.max(slide.widthPx, 1), 1)
  const images = await decodeSlideImages(slide)
  const [png] = await renderSlidesToPngBase64([slide], images, ratio)
  if (!png) throw new Error('thumbnail rasterization produced no image')
  const img = await decodeImage(`data:image/png;base64,${png}`)
  if (!img) throw new Error('thumbnail PNG failed to decode')
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(slide.widthPx * ratio))
  canvas.height = Math.max(1, Math.round(slide.heightPx * ratio))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  ctx.fillStyle = '#ffffff' // JPEG has no alpha channel
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', THUMB_JPEG_QUALITY)
}

/**
 * Fetch thumbnails for the given MDT page ids (or all pages of the current
 * project when omitted). Returns pageId → JPEG data URL for every page the
 * session knows; unchanged pages come straight from the hash cache without
 * a re-render.
 */
export async function fetchDesignThumbnails(
  slideIdByPageId: ReadonlyMap<string, string>,
  pageIds?: readonly string[],
): Promise<ThumbnailMap> {
  const wanted = pageIds ?? [...slideIdByPageId.keys()]
  const requestIds = wanted
    .map((pageId) => slideIdByPageId.get(pageId))
    .filter((id): id is string => id !== undefined)
  const raw = (await window.mdtApi?.designThumbnails(requestIds)) as ThumbnailEntry[] | null
  if (!raw) return new Map()
  const pageIdBySlideId = new Map(
    [...slideIdByPageId].map(([pageId, slideId]) => [slideId, pageId] as const),
  )
  const out = new Map<string, string>()
  for (const entry of raw) {
    const pageId = pageIdBySlideId.get(entry.pageId)
    if (!pageId) continue // page exists in the deck but not in the project (or vice versa) yet
    if (!entry.slide) continue
    const cached = thumbByHash.get(entry.hash)
    if (cached) {
      out.set(pageId, cached)
      continue
    }
    try {
      const dataUrl = await rasterizeThumbnail(entry.slide)
      thumbByHash.set(entry.hash, dataUrl)
      out.set(pageId, dataUrl)
    } catch {
      // a page that fails to rasterize simply keeps its placeholder card
    }
  }
  return out
}

/**
 * Subscribe the canvas to live page thumbnails: fetched on mount and after
 * every `slides:deck-changed` broadcast (same pattern as use-deck-sync),
 * dirty-page-only re-render via the content-hash cache (P07.03).
 */
export function useDesignThumbnails(): ThumbnailMap {
  const project = useMdtStore((s) => s.project)
  const overlay = useMdtStore((s) => s.overlay)
  const [thumbs, setThumbs] = useState<ThumbnailMap>(new Map())

  useEffect(() => {
    if (!project) return
    let alive = true
    // overlay ids are keyed `slideId::` → mdt page id
    const slideIdByPageId = new Map(
      Object.entries(overlay.ids)
        .filter(([key]) => key.endsWith('::'))
        .map(([key, pageId]) => [pageId, key.slice(0, -2)] as const),
    )
    const run = (): void => {
      const task = refreshTail
        .catch(() => undefined)
        .then(() => fetchDesignThumbnails(slideIdByPageId))
        .then((next) => {
          if (!alive || next.size === 0) return
          // merge: a page whose raster failed keeps its previous thumbnail
          setThumbs((prev) => {
            const merged = new Map(prev)
            for (const [k, v] of next) merged.set(k, v)
            return merged
          })
        })
        .catch(() => {})
      refreshTail = task
    }
    run()
    const off = window.slidesApi?.onDeckChanged(() => run())
    return () => {
      alive = false
      off?.()
    }
  }, [project, overlay])

  return thumbs
}
