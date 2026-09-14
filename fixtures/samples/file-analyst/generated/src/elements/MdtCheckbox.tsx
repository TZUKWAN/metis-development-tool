import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtCheckboxProps extends MdtElementBaseProps {
  checked: boolean
  label?: string
  disabled?: boolean
  onChange?: (checked: boolean) => void
}

/** Real <input type="checkbox"> with a visible or screen-only label. */
export function MdtCheckbox({ checked, label, disabled, onChange, ...base }: MdtCheckboxProps) {
  const boxId = `mdt-checkbox-${base.mdtId}`
  return (
    <span {...mdtProps({ ...base, className: base.className ?? 'mdt-field' })}>
      <input
        id={boxId}
        type="checkbox"
        checked={checked}
        disabled={disabled === true}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      {label !== undefined && <label htmlFor={boxId}>{label}</label>}
      {base.children}
    </span>
  )
}
