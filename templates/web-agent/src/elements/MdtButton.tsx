import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtButtonProps extends MdtElementBaseProps {
  label: string
  disabled?: boolean
  onClick?: () => void
}

/** Real <button> with an accessible name and the MDT mapping attribute. */
export function MdtButton({ label, disabled, onClick, ...base }: MdtButtonProps) {
  return (
    <button
      type="button"
      {...mdtProps({ ...base, className: base.className ?? 'mdt-button' })}
      aria-label={base.style?.['aria-label'] as string | undefined}
      disabled={disabled === true}
      onClick={onClick}
    >
      {label}
      {base.children}
    </button>
  )
}
