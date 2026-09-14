import { useRef, useState } from 'react'

import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtFilePickerProps extends MdtElementBaseProps {
  label?: string
  accept?: string
  multiple?: boolean
  /** receives the picked file names (browser side; upload is app logic) */
  onPick?: (files: { name: string; size: number }[]) => void
}

/** Real <input type="file"> styled as a picker row. */
export function MdtFilePicker({ label, accept, multiple, onPick, ...base }: MdtFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [names, setNames] = useState<string[]>([])
  const pickerId = `mdt-filepicker-${base.mdtId}`
  return (
    <span {...mdtProps({ ...base, className: base.className ?? 'mdt-field' })}>
      <label className="mdt-filepicker-button" htmlFor={pickerId}>
        {label ?? 'Choose file…'}
      </label>
      <input
        ref={inputRef}
        id={pickerId}
        type="file"
        accept={accept}
        multiple={multiple === true}
        className="mdt-sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).map((file) => ({
            name: file.name,
            size: file.size,
          }))
          setNames(files.map((file) => file.name))
          onPick?.(files)
        }}
      />
      {names.length > 0 && <span className="mdt-filepicker-names">{names.join(', ')}</span>}
      {base.children}
    </span>
  )
}
