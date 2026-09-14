import { mdtProps, type MdtElementBaseProps } from './layout'

export interface MdtDataTableColumn {
  header: string
  /** object key of the row holding the cell value */
  key: string
}

export interface MdtDataTableProps extends MdtElementBaseProps {
  columns: MdtDataTableColumn[]
  rows: Record<string, unknown>[]
  label?: string
}

/** Semantic <table>; columns come from the MDT element props. */
export function MdtDataTable({ columns, rows, label, ...base }: MdtDataTableProps) {
  return (
    <div {...mdtProps({ ...base, className: base.className ?? 'mdt-datatable' })}>
      <table style={{ width: '100%', height: '100%' }}>
        <caption className="mdt-sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>{String(row[column.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {base.children}
    </div>
  )
}
