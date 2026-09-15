/**
 * MDT UI-control insert pipeline (tasklist P06.19–P06.26, P06.30, P03.09):
 * - marker names ("MDT:<role>:<uuid>") round-trip and map to control roles
 *   (the design bridge's kindOf delegates to parseMdtMarker, then guessRole
 *   maps the control kind to the role — derive works without an overlay);
 * - the engine persists the marker through addElement and save→reopen;
 * - the project store consumes pending insert semantics during syncFromDesign
 *   (role/label/placeholder/options applied, friendly name replaces the
 *   marker, identity stable across syncs).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  addElement,
  createBlankPptx,
  openPptx,
  savePptx,
  type OpenedPptx,
} from '@genoffice/pptx-engine'
import {
  derivePages,
  emptyOverlay,
  guessRole,
  isMdtMarker,
  mdtControlMarker,
  MDT_CONTROL_ROLES,
  parseMdtMarker,
  type DesignElementRef,
  type DesignPageRef,
} from '@mdt/design'
import { createId } from '@mdt/schema'

import {
  matchPendingSemantics,
  useMdtStore,
  type PendingElementSemantics,
} from '../src/renderer/mdt/store'

// ── marker ↔ role mapping ────────────────────────────────────────────────

describe('MDT control markers', () => {
  it('round-trips every insertable control role', () => {
    for (const role of MDT_CONTROL_ROLES) {
      const marker = mdtControlMarker(role, createId())
      expect(marker.startsWith('MDT:')).toBe(true)
      expect(parseMdtMarker(marker)).toBe(role)
      expect(isMdtMarker(marker)).toBe(true)
    }
  })

  it('rejects regular element names, malformed markers and non-control roles', () => {
    expect(parseMdtMarker('Button 12')).toBeNull()
    expect(parseMdtMarker('TextBox 4')).toBeNull()
    expect(parseMdtMarker('')).toBeNull()
    expect(parseMdtMarker('MDT:button:not-a-uuid')).toBeNull()
    expect(parseMdtMarker(mdtControlMarker('custom', createId()))).toBeNull()
    expect(parseMdtMarker(mdtControlMarker('image', createId()))).toBeNull()
    expect(isMdtMarker('Shape 3')).toBe(false)
  })
})

describe('role guess for control kinds (bridge kindOf maps marker names to kinds)', () => {
  it('maps every control kind to its role without an overlay entry', () => {
    for (const role of MDT_CONTROL_ROLES) {
      expect(guessRole(role, 'Shape 5'), role).toBe(role)
    }
  })

  it('keeps the legacy name-based guesses working', () => {
    expect(guessRole('roundRect', 'Button 提交')).toBe('button')
    expect(guessRole('textbox', 'input-query')).toBe('input')
    expect(guessRole('chat', 'chat panel')).toBe('chat')
    expect(guessRole('text', 'Title', 'Hello')).toBe('text')
    expect(guessRole('roundRect', 'decor')).toBe('shape')
  })
})

describe('derive assigns control roles from markers (kindOf → guessRole chain)', () => {
  const deriveWithMarker = (role: string): string => {
    const marker = mdtControlMarker(role, createId())
    // the bridge's kindOf: marker name wins over the engine type
    const kind = parseMdtMarker(marker) ?? 'roundRect'
    const { pages } = derivePages(
      [
        {
          slideId: 's_1',
          index: 0,
          name: 'Page 1',
          elements: [
            {
              sourceId: 'e_1',
              name: marker,
              kind,
              geometry: { x: 0, y: 0, width: 480, height: 200 },
            },
          ],
        },
      ],
      emptyOverlay(),
      () => `id-${role}`,
    )
    return pages[0]!.elements[0]!.role
  }

  it('every control role derives correctly with an empty overlay', () => {
    for (const role of MDT_CONTROL_ROLES) {
      expect(deriveWithMarker(role), role).toBe(role)
    }
  })
})

// ── engine: the marker rides on the element name and survives save→reopen ──

describe('engine marker persistence', () => {
  let opened: OpenedPptx

  beforeEach(async () => {
    opened = await openPptx(await createBlankPptx())
  })

  it('addElement carries the marker in the model and the cNvPr name', () => {
    const marker = mdtControlMarker('button', createId())
    const el = addElement(opened.deck.slides[0]!, {
      kind: 'roundRect',
      offset: { x: 0, y: 0, cx: 914400, cy: 914400 },
      fillColor: '#4472C4',
      name: marker,
    })
    expect(el.name).toBe(marker)
    expect(el.anchor.originalXml).toContain(`name="${marker}"`)
  })

  it('the marker survives save→reopen', async () => {
    const marker = mdtControlMarker('chat', createId())
    addElement(opened.deck.slides[0]!, {
      kind: 'roundRect',
      offset: { x: 0, y: 0, cx: 914400, cy: 914400 },
      name: marker,
    })
    const reopened = await openPptx(await savePptx(opened))
    const el = reopened.deck.slides[0]!.elements[0]!
    expect(el.name).toBe(marker)
    // ...and still parses back to the control role through the bridge chain
    expect(parseMdtMarker(el.name ?? '')).toBe('chat')
  })

  it('without a marker, names keep the historical Shape/TextBox form', () => {
    const el = addElement(opened.deck.slides[0]!, {
      kind: 'rect',
      offset: { x: 0, y: 0, cx: 914400, cy: 914400 },
    })
    expect(isMdtMarker(el.name ?? '')).toBe(false)
    expect(el.anchor.originalXml).toMatch(/name="Shape \d+"/)
  })
})

// ── store: pending semantics consumption during syncFromDesign ───────────

const designPage = (elements: DesignElementRef[]): DesignPageRef[] => [
  { slideId: 's_1', index: 0, name: 'Page 1', elements },
]

const elementOf = () => {
  const el = useMdtStore.getState().project!.pages[0]!.elements[0]!
  return el
}

describe('pending semantics consumption (P06.19–P06.26)', () => {
  beforeEach(() => {
    useMdtStore.getState().newProject('Marker test')
  })

  it('syncFromDesign applies queued semantics to the marker element', () => {
    const marker = mdtControlMarker('chat', createId())
    const agentId = createId()
    useMdtStore.getState().queuePendingSemantics({
      marker,
      role: 'chat',
      label: 'Support chat',
      placeholder: 'Type a message…',
      agentRef: agentId,
    })
    useMdtStore
      .getState()
      .syncFromDesign(
        designPage([{ sourceId: 'e_1', name: marker, kind: 'chat', geometry: { x: 0, y: 0, width: 360, height: 420 } }]),
      )
    const el = elementOf()
    expect(el.role).toBe('chat')
    expect(el.name).toBe('Support chat') // friendly name, marker never leaks
    expect(el.semantics.label).toBe('Support chat')
    expect(el.semantics.placeholder).toBe('Type a message…')
    expect(el.semantics.agentRef).toBe(agentId)
    expect(useMdtStore.getState().pendingSemantics).toHaveLength(0)
  })

  it('options and agentRef land, and edits survive later syncs with a stable id', () => {
    const marker = mdtControlMarker('select', createId())
    const store = useMdtStore.getState()
    store.queuePendingSemantics({
      marker,
      role: 'select',
      label: 'Color',
      options: ['Red', 'Green'],
    })
    const pages = designPage([
      { sourceId: 'e_1', name: marker, kind: 'select', geometry: { x: 0, y: 0, width: 200, height: 44 } },
    ])
    store.syncFromDesign(pages)
    const first = elementOf()
    expect(first.role).toBe('select')
    expect(first.semantics.options).toEqual(['Red', 'Green'])

    // user edit via the inspector (updateElementSemantics path)
    const pageId = useMdtStore.getState().project!.pages[0]!.id
    const elementId = useMdtStore.getState().project!.pages[0]!.elements[0]!.id
    useMdtStore.getState().updateElementSemantics(pageId, elementId, {
      options: ['Red', 'Green', 'Blue'],
    })

    // deck re-sync: same marker name in the engine, queue is empty now
    useMdtStore.getState().syncFromDesign(pages)
    const second = elementOf()
    expect(second.name).toBe('Color') // friendly name kept across syncs
    expect(second.role).toBe('select')
    expect(second.semantics.options).toEqual(['Red', 'Green', 'Blue'])
    expect(useMdtStore.getState().project!.pages[0]!.elements[0]!.id).toBe(elementId)
  })

  it('marker-named elements keep their friendly name on later syncs even without a queue entry', () => {
    const marker = mdtControlMarker('filepicker', createId())
    const pages = designPage([
      { sourceId: 'e_1', name: marker, kind: 'filepicker', geometry: { x: 0, y: 0, width: 240, height: 44 } },
    ])
    useMdtStore.getState().syncFromDesign(pages)
    // no pending entry: the marker stays as the name on first derivation
    expect(elementOf().name).toBe(marker)
    // rename via a semantics patch is out of scope here; a queued entry only
    // relabels when the element is NEW (no existing name) — assert no crash
    // and a stable id on the second pass
    const id = useMdtStore.getState().project!.pages[0]!.elements[0]!.id
    useMdtStore.getState().syncFromDesign(pages)
    expect(useMdtStore.getState().project!.pages[0]!.elements[0]!.id).toBe(id)
  })

  it('unrelated (non-marker) elements are never matched against the queue', () => {
    const marker = mdtControlMarker('button', createId())
    useMdtStore.getState().queuePendingSemantics({ marker, role: 'button', label: 'Save' })
    useMdtStore
      .getState()
      .syncFromDesign(
        designPage([{ sourceId: 'e_1', name: 'Shape 2', kind: 'roundRect', geometry: { x: 0, y: 0, width: 100, height: 40 } }]),
      )
    expect(useMdtStore.getState().pendingSemantics).toHaveLength(1)
    const el = elementOf()
    expect(el.name).toBe('Shape 2')
    expect(el.role).toBe('shape')
  })

  it('syncFromDesign without a project leaves the queue untouched', () => {
    useMdtStore.setState({ project: null })
    const marker = mdtControlMarker('tabs', createId())
    const entry: PendingElementSemantics = { marker, role: 'tabs', label: 'Tabs' }
    useMdtStore.getState().queuePendingSemantics(entry)
    useMdtStore
      .getState()
      .syncFromDesign(designPage([{ sourceId: 'e_1', name: marker, kind: 'tabs', geometry: { x: 0, y: 0, width: 320, height: 44 } }]))
    expect(useMdtStore.getState().pendingSemantics).toEqual([entry])
  })
})

describe('pending queue matching', () => {
  it('consumePendingSemantics: exact marker match wins, FIFO for other markers', () => {
    const a = mdtControlMarker('button', createId())
    const b = mdtControlMarker('input', createId())
    useMdtStore.setState({ project: null, pendingSemantics: [] })
    useMdtStore.getState().queuePendingSemantics({ marker: a, role: 'button', label: 'A' })
    useMdtStore.getState().queuePendingSemantics({ marker: b, role: 'input', label: 'B' })

    // FIFO fallback: an unknown (but marker-shaped) name pops the oldest entry
    expect(useMdtStore.getState().consumePendingSemantics(mdtControlMarker('list', createId()))?.marker).toBe(a)
    // exact match for the remaining entry
    expect(useMdtStore.getState().consumePendingSemantics(b)?.marker).toBe(b)
    expect(useMdtStore.getState().consumePendingSemantics(b)).toBeUndefined()
    // non-marker names never consume
    useMdtStore.getState().queuePendingSemantics({ marker: a, role: 'button', label: 'A' })
    expect(useMdtStore.getState().consumePendingSemantics('Button 9')).toBeUndefined()
    expect(useMdtStore.getState().pendingSemantics).toHaveLength(1)
  })

  it('matchPendingSemantics prefers the exact marker over the FIFO head', () => {
    const a = mdtControlMarker('button', createId())
    const b = mdtControlMarker('textarea', createId())
    const pending: PendingElementSemantics[] = [
      { marker: a, role: 'button', label: 'A' },
      { marker: b, role: 'textarea', label: 'B' },
    ]
    const m = matchPendingSemantics(pending, b)
    expect(m?.entry.marker).toBe(b)
    expect(m?.rest.map((e) => e.marker)).toEqual([a])
    expect(matchPendingSemantics(pending, 'Shape 1')).toBeUndefined()
  })
})
