/**
 * Design bridge (tasklist P06, P03.08): exposes the authoritative deck
 * model as MDT DesignPageRefs so the renderer store can derive the MDT
 * project with stable identity — the engine's own durable ids
 * (a16:creationId / cNvPr) survive reorder and save→reopen.
 */
import { ipcMain } from 'electron'

import { elementDurableId, slideDurableId } from '@genoffice/pptx-engine/identity'
import type { Slide, SlideElement } from '@genoffice/pptx-engine'
import type { DesignElementRef, DesignPageRef } from '@mdt/design'

interface DeckLike {
  slides: Slide[]
}

const EMU_PER_PX = 9525 // 96 dpi

export function buildDesignSlides(deck: DeckLike): DesignPageRef[] {
  return deck.slides.map((slide, index) => ({
    slideId: slideDurableId(slide),
    index,
    name: `Page ${index + 1}`,
    elements: slide.elements.map(toRef).filter((el): el is DesignElementRef => el !== null),
  }))
}

function toRef(el: SlideElement): DesignElementRef | null {
  const sourceId = elementDurableId(el) ?? el.id
  const text = readText(el)
  const t = el.transform
  const ref: DesignElementRef = {
    sourceId,
    name: el.name ?? sourceId,
    kind: kindOf(el),
    geometry: {
      x: Math.round((t?.offset?.x ?? 0) / EMU_PER_PX),
      y: Math.round((t?.offset?.y ?? 0) / EMU_PER_PX),
      width: Math.round((t?.offset?.cx ?? 914400) / EMU_PER_PX),
      height: Math.round((t?.offset?.cy ?? 914400) / EMU_PER_PX),
      ...(t?.rot ? { rotation: t.rot / 60000 } : {}),
    },
    ...(text !== undefined ? { text } : {}),
  }
  if (el.type === 'group' && el.children.length > 0) {
    ref.children = el.children.map(toRef).filter((c): c is DesignElementRef => c !== null)
  }
  return ref
}

function kindOf(el: SlideElement): string {
  switch (el.type) {
    case 'text':
      return 'text'
    case 'picture':
      return 'image'
    case 'group':
      return 'group'
    case 'table':
      return 'table'
    case 'chart':
      return 'chart'
    case 'passthrough':
      return 'placeholder'
    default:
      return el.presetGeometry ?? 'shape'
  }
}

function readText(el: SlideElement): string | undefined {
  if (el.type === 'text' || el.type === 'shape') {
    const body = el.text
    if (!body) return undefined
    const text = body.paragraphs
      .flatMap((p) => (Array.isArray(p.runs) ? p.runs : []))
      .map((r) => (typeof r.text === 'string' ? r.text : ''))
      .join('')
    return text.length > 0 ? text : undefined
  }
  return undefined
}

/** Register the design-slides IPC (needs the slides sessions map). */
export function registerMdtDesignIpc(sessions: Map<number, { opened: { deck: DeckLike } }>): void {
  ipcMain.handle('mdt:design-slides', (e) => {
    const session = sessions.get(e.sender.id)
    if (!session) return null
    return buildDesignSlides(session.opened.deck)
  })
}
