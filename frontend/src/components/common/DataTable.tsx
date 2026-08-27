import type { ReactNode } from 'react'

interface DataTableColumn<T> { header: string; render: (row: T) => ReactNode }
export function DataTable<T extends { id: string }>({ columns, rows, empty }: { columns: DataTableColumn<T>[]; rows: T[]; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>
  const [primary, ...details] = columns
  return <>
    <div className="hidden overflow-hidden rounded border border-border md:block">
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-background text-xs uppercase tracking-wide text-muted">
            <tr>{columns.map((column) => <th key={column.header} className="whitespace-nowrap px-3 py-2.5 font-bold">{column.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {rows.map((row) => <tr key={row.id} className="transition-colors hover:bg-background/70">
              {columns.map((column) => <td key={column.header} className="max-w-sm px-3 py-2.5 align-top text-text">{column.render(row)}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
    <div className="space-y-2 md:hidden">
      {rows.map((row) => <article key={row.id} className="rounded border border-border bg-surface p-3 shadow-sm">
        <div className="min-w-0 text-sm font-semibold text-text">{primary.render(row)}</div>
        {details.length > 0 && <dl className="mt-2 space-y-1.5">
          {details.map((column) => <div key={column.header} className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2 text-sm">
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">{column.header}</dt>
            <dd className="min-w-0 text-text">{column.render(row)}</dd>
          </div>)}
        </dl>}
      </article>)}
    </div>
  </>
}
