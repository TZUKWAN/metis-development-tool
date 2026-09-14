import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtInputProps extends MdtElementBaseProps {
  value: string
  placeholder?: string
  label?: string
  type?: 'text' | 'email' | 'password' | 'number'
  disabled?: boolean
  onChange?: (value: string) => void
  onSubmit?: () => void
}

/** Real <input> bound to page state; Enter triggers the submit handler. */
export function MdtInput({
  value,
  placeholder,
  label,
  type = 'text',
  disabled,
  onChange,
  onSubmit,
  ...base
}: MdtInputProps) {
  const inputId = `mdt-input-${base.mdtId}`
  return (
    <span {...mdtProps({ ...base, className: base.className ?? 'mdt-field' })}>
      {label !== undefined && (
        <label className="mdt-sr-only" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled === true}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.()
        }}
        style={{ width: '100%', height: '100%' }}
      />
      {base.children}
    </span>
  )
}
