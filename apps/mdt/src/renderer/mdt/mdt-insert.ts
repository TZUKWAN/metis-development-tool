/**
 * MDT UI-control insert pipeline (tasklist P06.19–P06.26, P03.09).
 *
 * The engine renders generic shapes/text; an MDT control is inserted as a
 * styled shape/text element whose <p:cNvPr name> carries a durable semantic
 * marker ("MDT:<role>:<uuid>"). The marker flows through the engine, survives
 * save→reopen, and drives the whole chain:
 *
 *   ribbon button → insertMdtControl → engine element (marker name)
 *     → pending-semantics queue → derive (design bridge: marker → role)
 *     → MDT element with role/label/a11y semantics → blueprint → generator
 *     → generated semantic component (templates/web-agent/src/elements/*).
 */
import { createId, type ElementRole } from '@mdt/schema'
import {
  mdtControlMarker,
  MDT_CONTROL_ROLES,
  type DesignPageRef,
  type MdtControlRole,
} from '@mdt/design'

import type { ActionCtx } from '../action-context'
import { FIT_WIDTH } from '../app-constants'
import { useMdtStore } from './store'

/** The roles insertable from the ribbon's MDT Controls group. */
export type { MdtControlRole }

/** Engine geometry/style + default semantics for one control role. */
export interface MdtControlSpec {
  role: MdtControlRole
  /** engine insert kind: text box or preset geometry */
  kind: 'textbox' | 'roundRect' | 'rect'
  /** default size (px in the fitWidth viewport) */
  w: number
  h: number
  /** default accessible label; also the friendly element name */
  label: string
  /** canvas text (defaults to the label); `\n` splits paragraphs */
  text?: string
  fill?: string
  stroke?: { color: string; widthPt: number }
  bold?: boolean
  fontFamily?: string
  /** canvas text color (defaults to the deck text color) */
  textColor?: string
  /** default semantics.placeholder for field-like roles */
  placeholder?: string
  /** default semantics.options for option-list roles (sample values, editable) */
  options?: string[]
}

const FIELD_STROKE = { color: '#8C8C8C', widthPt: 1 }
const WHITE = '#FFFFFF'

/** Ordered specs for the ribbon menu; keys are the schema ElementRole names. */
export const MDT_CONTROL_PRESETS: Record<MdtControlRole, MdtControlSpec> = {
  button: {
    role: 'button',
    kind: 'roundRect',
    w: 160,
    h: 48,
    label: 'Button',
    text: 'Button',
    fill: '#4472C4',
    bold: true,
    textColor: '#FFFFFF',
  },
  input: {
    role: 'input',
    kind: 'textbox',
    w: 240,
    h: 44,
    label: 'Input',
    text: 'Enter text',
    stroke: FIELD_STROKE,
    placeholder: 'Enter text',
  },
  textarea: {
    role: 'textarea',
    kind: 'textbox',
    w: 320,
    h: 120,
    label: 'Textarea',
    text: 'Enter text',
    stroke: FIELD_STROKE,
    placeholder: 'Enter text',
  },
  checkbox: {
    role: 'checkbox',
    kind: 'roundRect',
    w: 200,
    h: 40,
    label: 'Checkbox',
    text: 'Option 1',
    options: ['Option 1', 'Option 2'],
  },
  select: {
    role: 'select',
    kind: 'roundRect',
    w: 200,
    h: 44,
    label: 'Select',
    text: 'Select ▾',
    fill: WHITE,
    stroke: FIELD_STROKE,
    options: ['Option A', 'Option B'],
  },
  tabs: {
    role: 'tabs',
    kind: 'roundRect',
    w: 320,
    h: 44,
    label: 'Tabs',
    text: 'Tab 1   Tab 2   Tab 3',
    fill: WHITE,
    stroke: FIELD_STROKE,
    options: ['Tab 1', 'Tab 2', 'Tab 3'],
  },
  list: {
    role: 'list',
    kind: 'textbox',
    w: 240,
    h: 160,
    label: 'List',
    text: '• Item 1\n• Item 2\n• Item 3',
    fill: WHITE,
    stroke: FIELD_STROKE,
  },
  datatable: {
    role: 'datatable',
    kind: 'rect',
    w: 480,
    h: 200,
    label: 'Data table',
    text: 'Data table',
    fill: WHITE,
    stroke: FIELD_STROKE,
  },
  chat: {
    role: 'chat',
    kind: 'roundRect',
    w: 360,
    h: 420,
    label: 'Chat',
    fill: WHITE,
    stroke: FIELD_STROKE,
    placeholder: 'Type a message…',
  },
  filepicker: {
    role: 'filepicker',
    kind: 'roundRect',
    w: 240,
    h: 44,
    label: 'File picker',
    text: 'Choose file…',
    fill: WHITE,
    stroke: FIELD_STROKE,
  },
  codeblock: {
    role: 'codeblock',
    kind: 'textbox',
    w: 480,
    h: 280,
    label: 'Code block',
    text: '// code',
    fill: WHITE,
    stroke: FIELD_STROKE,
    fontFamily: 'Courier New',
  },
  browserframe: {
    role: 'browserframe',
    kind: 'rect',
    w: 640,
    h: 420,
    label: 'Browser frame',
    text: '🌐 https://example.com',
    fill: WHITE,
    stroke: FIELD_STROKE,
  },
}

/** Menu order for the ribbon group. */
export const MDT_CONTROLS: MdtControlSpec[] = MDT_CONTROL_ROLES.map(
  (role) => MDT_CONTROL_PRESETS[role],
)

/**
 * Insert an MDT UI control on the current page: queue the pending semantics,
 * add the marked engine element, then pull an immediate derivation so the
 * element lands in the MDT project with its role/label already applied
 * (the deck-changed broadcast is multi-window only, so the pipeline cannot
 * rely on it in the ordinary single-window session).
 */
export async function insertMdtControl(
  ctx: ActionCtx,
  role: MdtControlRole,
  override?: Partial<Omit<MdtControlSpec, 'role' | 'kind'>>,
): Promise<void> {
  const { slide, current } = ctx
  if (!slide) return
  const spec: MdtControlSpec = { ...MDT_CONTROL_PRESETS[role], ...override }
  const marker = mdtControlMarker(role, createId())
  const store = useMdtStore.getState()
  store.queuePendingSemantics({
    marker,
    role: role as ElementRole,
    label: spec.label,
    ...(spec.placeholder !== undefined ? { placeholder: spec.placeholder } : {}),
    ...(spec.options !== undefined ? { options: spec.options } : {}),
  })
  const w = Math.min(spec.w, Math.round(slide.widthPx * 0.9))
  const h = Math.min(spec.h, Math.round(slide.heightPx * 0.9))
  const text = spec.text ?? spec.label
  const r = await window.slidesApi.addElement({
    slideIndex: current,
    kind: spec.kind,
    xPx: Math.round((slide.widthPx - w) / 2),
    yPx: Math.round((slide.heightPx - h) / 2),
    wPx: w,
    hPx: h,
    fitWidthPx: FIT_WIDTH,
    name: marker,
    ...(spec.fill ? { fillColor: spec.fill } : {}),
    ...(spec.stroke ? { stroke: spec.stroke } : {}),
    paragraphs: [
      {
        align: 'center',
        runs: [
          {
            text,
            fontSize: role === 'codeblock' ? 14 : 16,
            ...(spec.bold ? { bold: true } : {}),
            ...(spec.textColor ? { color: spec.textColor } : {}),
            ...(spec.fontFamily ? { fontFamily: spec.fontFamily } : {}),
          },
        ],
      },
    ],
  })
  if (!r) {
    // element never landed: drop the queued entry so it cannot attach later
    useMdtStore.getState().consumePendingSemantics(marker)
    return
  }
  ctx.applySlide(current, r.slide)
  ctx.setSelectedIds([r.sourceId])
  try {
    const slides = (await window.mdtApi?.designSlides()) as DesignPageRef[] | null
    if (slides) useMdtStore.getState().syncFromDesign(slides)
  } catch {
    // derivation failed (no project?): the pending entry is consumed by the
    // next deck sync instead
  }
  ctx.setStatus(`MDT ${spec.label} inserted`)
}
