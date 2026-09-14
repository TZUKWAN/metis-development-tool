import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtSelectProps extends MdtElementBaseProps {
  value: string
  options: string[]
  label?: string
  disabled?: boolean
  onChange?: (value: string) => void
}

/** Real <select> with an <option> per MDT option entry. */
export function MdtSelect({ value, options, label, disabled, onChange, ...base }: MdtSelectProps) {
  const selectId = `mdt-select-${base.mdtId}`
  return (
    <span {...mdtProps({ ...base, className: base.className ?? 'mdt-field' })}>
      {label !== undefined && (
        <label className="mdt-sr-only" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        disabled={disabled === true}
        aria-label={label}
        onChange={(event) => onChange?.(event.target.value)}
        style={{ width: '100%', height: '100%' }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {base.children}
    </span>
  )
}
