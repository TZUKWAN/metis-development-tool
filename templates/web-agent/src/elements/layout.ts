import type { CSSProperties } from 'react'

/** Geometry + style payload from the MDT element model (adapter-owned keys). */
export interface MdtGeometry {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

/** Shared props every generated element passes to its semantic component. */
export interface MdtElementBaseProps {
  /** MDT element id — rendered as data-mdt-id for design↔source mapping */
  mdtId: string
  geometry?: MdtGeometry
  style?: Record<string, unknown>
  className?: string
  children?: React.ReactNode
}

/** Convert MDT geometry + style tokens into absolute-position CSS. */
export function absoluteStyle(
  geometry: MdtGeometry | undefined,
  style: Record<string, unknown> | undefined,
): CSSProperties {
  const css: CSSProperties = geometry
    ? {
        position: 'absolute',
        left: geometry.x,
        top: geometry.y,
        width: geometry.width || undefined,
        height: geometry.height || undefined,
        transform: geometry.rotation ? `rotate(${geometry.rotation}deg)` : undefined,
      }
    : {}
  if (style) {
    for (const [key, value] of Object.entries(style)) {
      // adapter-defined style tokens use css property names or kebab-case
      const prop = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
      ;(css as Record<string, unknown>)[prop] = value
    }
  }
  return css
}

export function mdtProps(base: MdtElementBaseProps): {
  'data-mdt-id': string
  style: CSSProperties
  className?: string
} {
  return {
    'data-mdt-id': base.mdtId,
    style: absoluteStyle(base.geometry, base.style),
    className: base.className,
  }
}
