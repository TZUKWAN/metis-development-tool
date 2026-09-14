import { useState } from 'react'

import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtTabsProps extends MdtElementBaseProps {
  options: string[]
  /** controlled value when the page manages it, else internal state */
  value?: string
  label?: string
  onChange?: (value: string) => void
}

/** Tab strip with real buttons and aria roles (aria-current marks active). */
export function MdtTabs({ options, value, label, onChange, ...base }: MdtTabsProps) {
  const [internal, setInternal] = useState(options[0] ?? '')
  const active = value ?? internal
  return (
    <div
      {...mdtProps({ ...base, className: base.className ?? 'mdt-tabs' })}
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={option === active}
          aria-current={option === active || undefined}
          onClick={() => {
            setInternal(option)
            onChange?.(option)
          }}
        >
          {option}
        </button>
      ))}
      {base.children}
    </div>
  )
}
