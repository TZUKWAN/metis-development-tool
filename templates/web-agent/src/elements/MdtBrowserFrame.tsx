import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtBrowserFrameProps extends MdtElementBaseProps {
  url?: string
  label?: string
}

/**
 * Embedded web view placeholder: an <iframe> for http(s) urls when embeds
 * are allowed, otherwise an accessible link card (most sites block iframes
 * via X-Frame-Options).
 */
export function MdtBrowserFrame({ url, label, ...base }: MdtBrowserFrameProps) {
  return (
    <div {...mdtProps({ ...base, className: base.className ?? 'mdt-browserframe' })}>
      {url ? (
        <iframe src={url} title={label ?? url} sandbox="allow-scripts allow-forms">
          <p>
            Embedded view of <a href={url}>{url}</a>
          </p>
        </iframe>
      ) : (
        <p className="mdt-browserframe-empty">{label ?? 'No url configured'}</p>
      )}
      {base.children}
    </div>
  )
}
