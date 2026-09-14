/**
 * MDT design adapter (tasklist P03.08, P04.04).
 *
 * The GenOffice Slides engine owns the visual model (RenderSlide trees).
 * This adapter derives an MDT Page/Element projection with STABLE identity:
 * a slide's page id and every element id are content-independent and survive
 * rename/reorder/duplicate. MDT-specific semantics (roles, agent refs,
 * interaction handles, component instances) live as an overlay keyed by
 * those stable ids, so designer operations never lose agent wiring
 * (P06.13: grouping must not sever semantics).
 *
 * The renderer business layer imports ONLY this package — never pptx types.
 */

/**
 * Stable id for a design page given its position-independent slide key.
 * Slides in the engine are addressed by sourceId; the overlay maps
 * sourceId → mdt page id once, then never derives from indices.
 */
export interface DesignPageRef {
  /** engine slide identity (RenderSlide.sourceId) */
  slideId: string
  index: number
  name: string
  /** visual element descriptors within the slide */
  elements: DesignElementRef[]
}

export interface DesignElementRef {
  /** engine element identity (node.sourceId) */
  sourceId: string
  name: string
  kind: string
  geometry: { x: number; y: number; width: number; height: number; rotation?: number }
  text?: string
  children?: DesignElementRef[]
}

export interface DerivedPage {
  id: string
  slideId: string
  name: string
  elements: DerivedElement[]
}

export interface DerivedElement {
  id: string
  sourceId: string
  name: string
  role: ElementRoleGuess
  visual: {
    kind: string
    geometry: { x: number; y: number; width: number; height: number; rotation?: number }
    style: Record<string, string | number | boolean | null>
    props: Record<string, string | number | boolean | null>
  }
  children: DerivedElement[]
}

export type ElementRoleGuess =
  'text' | 'shape' | 'image' | 'icon' | 'group' | 'button' | 'input' | 'chat' | 'custom'

/**
 * Map engine kind → MDT role. Buttons/text placeholders are recognized from
 * the slide engine's naming conventions; users can override roles in the
 * property inspector (the overlay wins over the guess).
 */
export function guessRole(kind: string, name: string, text?: string): ElementRoleGuess {
  const k = kind.toLowerCase()
  const n = name.toLowerCase()
  if (k === 'button' || n.startsWith('button') || n.includes('按钮')) return 'button'
  if (k === 'input' || k === 'textbox' || n.startsWith('input') || n.includes('输入'))
    return 'input'
  if (k === 'chat' || n.startsWith('chat') || n.includes('对话')) return 'chat'
  if (k === 'image' || k === 'picture') return 'image'
  if (k === 'group') return 'group'
  if (k === 'text') return 'text'
  if (typeof text === 'string' && text.length > 0) return 'text'
  return 'shape'
}

/** Deterministic namespace separator for derived overlay keys. */
export const overlayKey = (slideId: string, sourceId: string): string => `${slideId}::${sourceId}`

export interface MdtOverlay {
  /** stable mdt ids per overlay key; first derivation assigns, later derivations reuse */
  ids: Record<string, string>
  /** page-type overrides (slide index 0 may be a modal, etc.) */
  pageTypes: Record<string, 'page' | 'modal' | 'drawer' | 'popover'>
  /** semantic overrides keyed by overlay key (role, agentRef, handles, label) */
  semantics: Record<
    string,
    {
      role?: ElementRoleGuess
      label?: string
      agentRef?: string
      handles?: string[]
      placeholder?: string
      options?: string[]
      componentRef?: string
    }
  >
}

export function emptyOverlay(): MdtOverlay {
  return { ids: {}, pageTypes: {}, semantics: {} }
}

/** Ids assigned by the host (renderer store) — the adapter never generates randomness itself. */
export type IdFactory = () => string

/**
 * Derive the MDT page projection from design pages, reusing ids recorded in
 * the overlay and assigning fresh ids (via `newId`) for new objects.
 * Returns the new overlay state — derivation is pure.
 */
export function derivePages(
  designPages: DesignPageRef[],
  overlay: MdtOverlay,
  newId: IdFactory,
): { pages: DerivedPage[]; overlay: MdtOverlay } {
  const ids = { ...overlay.ids }
  const semantics = { ...overlay.semantics }
  const pages: DerivedPage[] = designPages.map((page) => {
    const pageKey = overlayKey(page.slideId, '')
    if (!ids[pageKey]) ids[pageKey] = newId()
    const elements = page.elements.map((el) =>
      deriveElement(page.slideId, el, ids, semantics, newId),
    )
    return {
      id: ids[pageKey],
      slideId: page.slideId,
      name: page.name,
      elements,
    }
  })
  // drop overlay ids whose slide vanished (GC keeps the doc small)
  const liveKeys = new Set<string>()
  for (const page of designPages) {
    liveKeys.add(overlayKey(page.slideId, ''))
    const walk = (els: DesignElementRef[]) => {
      for (const el of els) {
        liveKeys.add(overlayKey(page.slideId, el.sourceId))
        walk(el.children ?? [])
      }
    }
    walk(page.elements)
  }
  for (const key of Object.keys(ids)) {
    if (!liveKeys.has(key)) delete ids[key]
  }
  return { pages, overlay: { ids, pageTypes: overlay.pageTypes, semantics } }
}

function deriveElement(
  slideId: string,
  el: DesignElementRef,
  ids: Record<string, string>,
  semantics: MdtOverlay['semantics'],
  newId: IdFactory,
): DerivedElement {
  const key = overlayKey(slideId, el.sourceId)
  if (!ids[key]) ids[key] = newId()
  const override = semantics[key]
  return {
    id: ids[key],
    sourceId: el.sourceId,
    name: el.name,
    role: override?.role ?? guessRole(el.kind, el.name, el.text),
    visual: {
      kind: el.kind,
      geometry: el.geometry,
      style: {},
      props: { ...(el.text !== undefined ? { text: el.text } : {}) },
    },
    children: (el.children ?? []).map((c) => deriveElement(slideId, c, ids, semantics, newId)),
  }
}

/** Look up the stable element id for an engine (slideId, sourceId) pair. */
export function elementIdFor(
  overlay: MdtOverlay,
  slideId: string,
  sourceId: string,
): string | undefined {
  return overlay.ids[overlayKey(slideId, sourceId)]
}

/** Page id for a slide. */
export function pageIdFor(overlay: MdtOverlay, slideId: string): string | undefined {
  return overlay.ids[overlayKey(slideId, '')]
}
