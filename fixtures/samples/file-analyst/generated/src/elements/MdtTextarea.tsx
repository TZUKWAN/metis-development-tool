import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtTextareaProps extends MdtElementBaseProps {
  value: string
  placeholder?: string
  label?: string
  disabled?: boolean
  onChange?: (value: string) => void
}

/** Real <textarea> bound to page state. */
export function MdtTextarea({
  value,
  placeholder,
  label,
  disabled,
  onChange,
  ...base
}: MdtTextareaProps) {
  const areaId = `mdt-textarea-${base.mdtId}`
  return (
    <span {...mdtProps({ ...base, className: base.className ?? 'mdt-field' })}>
      {label !== undefined && (
        <label className="mdt-sr-only" htmlFor={areaId}>
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        value={value}
        placeholder={placeholder}
        disabled={disabled === true}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        style={{ width: '100%', height: '100%', resize: 'none' }}
      />
      {base.children}
    </span>
  )
}
