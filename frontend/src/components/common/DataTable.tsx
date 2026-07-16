import type { ReactNode } from 'react'

interface DataTableColumn<T> { header: string; render: (row: T) => ReactNode }
export function DataTable<T extends { id: string }>({ columns, rows, empty }: { columns: DataTableColumn<T>[]; rows: T[]; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>
  return <div className="overflow-x-auto rounded-xl border border-border"><table className="min-w-full text-left text-sm"><thead className="bg-background text-xs uppercase tracking-wide text-muted"><tr>{columns.map((column) => <th key={column.header} className="whitespace-nowrap px-4 py-3 font-bold">{column.header}</th>)}</tr></thead><tbody className="divide-y divide-border bg-surface">{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.header} className="whitespace-nowrap px-4 py-3 text-text">{column.render(row)}</td>)}</tr>)}</tbody></table></div>
}
