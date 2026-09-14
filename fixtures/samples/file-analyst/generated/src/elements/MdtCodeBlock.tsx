import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtCodeBlockProps extends MdtElementBaseProps {
  text: string
  language?: string
  label?: string
}

/** Read-only <pre><code> block; bound to agent/capability outputs. */
export function MdtCodeBlock({ text, language, label, ...base }: MdtCodeBlockProps) {
  return (
    <pre {...mdtProps({ ...base, className: base.className ?? 'mdt-codeblock' })} aria-label={label}>
      <code data-language={language}>{text}</code>
    </pre>
  )
}
