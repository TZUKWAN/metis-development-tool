import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtListItem {
  id?: string
  title?: string
  subtitle?: string
  text?: string
}

export interface MdtListProps extends MdtElementBaseProps {
  items: MdtListItem[] | string[]
  label?: string
  onActivate?: (item: MdtListItem | string, index: number) => void
}

/** Semantic <ul> list; string items render as plain rows. */
export function MdtList({ items, label, onActivate, ...base }: MdtListProps) {
  return (
    <ul {...mdtProps({ ...base, className: base.className ?? 'mdt-list' })} aria-label={label}>
      {items.map((item, index) => {
        const entry: MdtListItem = typeof item === 'string' ? { text: item } : item
        const key = entry.id ?? `${index}`
        const text = entry.text ?? entry.title ?? entry.subtitle ?? ''
        return (
          <li key={key} onClick={onActivate ? () => onActivate(item, index) : undefined}>
            {entry.title !== undefined && <strong>{entry.title}</strong>}
            {entry.subtitle !== undefined && <span>{entry.subtitle}</span>}
            {entry.title === undefined && entry.subtitle === undefined ? text : null}
          </li>
        )
      })}
      {base.children}
    </ul>
  )
}
