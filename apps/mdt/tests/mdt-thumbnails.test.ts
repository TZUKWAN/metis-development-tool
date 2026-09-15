/**
 * Design thumbnails bridge tests (tasklist P07.03): the main-process bridge
 * turns a slides session into per-page thumbnail descriptors (durable page
 * id, content hash, render tree) with a pageIds filter — the renderer does
 * the bitmap step and caches by hash, so only dirty pages re-rasterize.
 */
import { describe, expect, it, vi } from 'vitest'

// channel registration is exercised with a mocked electron
const handleSpy = vi.fn()
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: unknown) => handleSpy(channel, handler) },
  BrowserWindow: { getAllWindows: () => [] },
  webContents: { fromId: () => null },
}))
vi.mock('../src/main/fonts', () => ({
  createSystemFontMetrics: () => ({}),
  resetFontRegistry: () => {},
}))

import {
  collectDesignThumbnails,
  hashRenderSlide,
  registerMdtThumbnailsIpc,
  type DesignThumbnailEntry,
} from '../src/main/mdt-thumbnails'
import type { Session } from '../src/main/session-state'
import type { RenderSlide } from '@genoffice/pptx-render'

/** Stub session: only the fields the bridge reads are populated. */
function stubSession(paths: string[]): Session {
  return {
    path: '',
    fitWidthPx: 1280,
    undoStack: [],
    redoStack: [],
    opened: {
      deck: { slides: paths.map((p) => ({ path: p })), size: { cx: 1, cy: 1 } },
    },
  } as unknown as Session
}

const render = (label: string): RenderSlide =>
  ({ widthPx: 320, heightPx: 180, nodes: [], background: { kind: 'none' }, label }) as never

const rebuildOf =
  (labels: string[]) =>
  (_session: Session, slideIndex: number): RenderSlide | null =>
    render(labels[slideIndex] ?? `slide-${slideIndex}`)

describe('collectDesignThumbnails (P07.03)', () => {
  it('collects one entry per slide with its durable page id', () => {
    const session = stubSession(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])
    const entries = collectDesignThumbnails(session, undefined, rebuildOf(['a', 'b']))
    expect(entries.map((e) => e.pageId)).toEqual(['s_1', 's_2'])
    expect(entries.map((e) => e.index)).toEqual([0, 1])
    expect(entries[0]?.slide).toEqual(render('a'))
    expect(entries[0]?.hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('narrows to the requested pageIds (dirty-page filter)', () => {
    const session = stubSession(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])
    const entries = collectDesignThumbnails(session, ['s_2'], rebuildOf(['a', 'b']))
    expect(entries.map((e) => e.pageId)).toEqual(['s_2'])
  })

  it('hashes content, not position: changed pages hash differently, unchanged pages identically', () => {
    const session = stubSession(['ppt/slides/slide1.xml'])
    const before = collectDesignThumbnails(session, undefined, rebuildOf(['a']))
    const after = collectDesignThumbnails(session, undefined, rebuildOf(['b']))
    expect(before[0]?.hash).not.toBe(after[0]?.hash)

    const session2 = stubSession(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])
    const two = collectDesignThumbnails(session2, undefined, rebuildOf(['a', 'a']))
    // identical content → identical hash (the renderer's dirty-page cache key)
    expect(two[0]?.hash).toBe(two[1]?.hash)
    expect(two[0]?.hash).toBe(before[0]?.hash)
  })

  it('handles failed rebuilds with a stable null-page hash', () => {
    const session = stubSession(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])
    const failing = (): RenderSlide | null => null
    const [first, second] = collectDesignThumbnails(session, undefined, failing)
    expect(first?.slide).toBeNull()
    expect(first?.hash).toBe(hashRenderSlide(null, first!.pageId))
    // distinct pages hash differently even when both fail
    expect(first?.hash).not.toBe(second?.hash)
  })
})

describe('registerMdtThumbnailsIpc', () => {
  it('registers the mdt:design-thumbnails channel and serves the sender session', () => {
    handleSpy.mockClear()
    const session = stubSession(['ppt/slides/slide1.xml'])
    const sessions = new Map<number, Session>([[7, session]])
    registerMdtThumbnailsIpc(sessions, rebuildOf(['a']))
    expect(handleSpy).toHaveBeenCalledTimes(1)
    const [channel, handler] = handleSpy.mock.calls[0] as [string, (e: unknown, p?: unknown) => unknown]
    expect(channel).toBe('mdt:design-thumbnails')

    const event = { sender: { id: 7 } }
    const entries = handler(event, { pageIds: ['s_1'] }) as DesignThumbnailEntry[]
    expect(entries).toHaveLength(1)
    expect(entries[0]?.pageId).toBe('s_1')

    // unknown sender (no deck open) → null, like the other mdt channels
    expect(handler({ sender: { id: 99 } }, undefined)).toBeNull()
  })
})
