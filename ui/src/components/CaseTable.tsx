import { useEffect, useState } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

export interface TableColumn {
  key: string
  label: string
  mono?: boolean
  align?: 'left' | 'right'
  render?: (row: any) => React.ReactNode
}

interface Props {
  columns: TableColumn[]
  fetchPage: (page: number, q: string) => Promise<{ rows: any[]; total: number }>
  searchPlaceholder: string
  emptyText: string
  scopeKey: string
  pageSize?: number
}

export default function CaseTable({ columns, fetchPage, searchPlaceholder, emptyText, scopeKey, pageSize = 50 }: Props) {
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPage(1); setAppliedQ('')
  }, [scopeKey])

  useEffect(() => {
    let live = true
    setLoading(true)
    fetchPage(page, appliedQ)
      .then(d => { if (!live) return; setRows(d.rows || []); setTotal(d.total || 0) })
      .catch(() => { if (live) { setRows([]); setTotal(0) } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [page, appliedQ, scopeKey])

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="gov-card p-4">
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gov-faint" />
        <input
          className="gov-input pl-8 pr-8 !py-1.5 text-xs"
          placeholder={searchPlaceholder}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); setAppliedQ(q.trim()) } }}
        />
        {q && (
          <button onClick={() => { setQ(''); setPage(1); setAppliedQ('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gov-faint hover:text-gov-ink">✕</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-gov-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gov-faint text-center py-8">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gov-border">
                {columns.map(c => (
                  <th key={c.key} className={`text-left font-semibold text-gov-muted px-2 py-2 whitespace-nowrap ${c.align === 'right' ? '!text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gov-border last:border-0 hover:bg-gov-wash">
                  {columns.map(c => (
                    <td key={c.key} className={`px-2 py-2 text-gov-ink align-top ${c.mono ? 'font-mono' : ''} ${c.align === 'right' ? 'text-right whitespace-nowrap' : ''}`}>
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-gov-muted font-mono">
          Page {page} of {pages} · {total.toLocaleString('en-IN')} total
        </p>
        <div className="flex gap-1.5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}
            className="gov-ghost border border-gov-border !px-2 !py-1 disabled:opacity-40">
            <ChevronLeft size={13} />
          </button>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages || loading}
            className="gov-ghost border border-gov-border !px-2 !py-1 disabled:opacity-40">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
