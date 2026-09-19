import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { searchPeople } from '../api/client'
import { useLang } from '../i18n/LanguageContext'

interface Hit {
  id: string
  name: string
  cell?: string
  role?: string
  phone?: string
  account?: string
}

export default function GlobalSearch() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<Hit[]>([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)

  const search = async (val: string) => {
    setQ(val)
    if (!val.trim()) { setResults([]); setOpen(false); return }
    setLoading(true); setOpen(true)
    try {
      const iid = sessionStorage.getItem('caseId') || undefined
      const { data } = await searchPeople(val.trim(), iid)
      setResults(data.results || [])
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  const pick = (h: Hit) => {
    // Hand the selection to the graph view, which focuses + opens the profile.
    sessionStorage.setItem('focusNode', h.id)
    setOpen(false); setQ('')
    navigate('/graph')
  }

  return (
    <div className="relative flex-1 max-w-md">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gov-faint" />
        <input
          className="gov-input pl-8 pr-8 !py-1.5 text-xs"
          placeholder={t('common.search_placeholder')}
          value={q}
          onChange={e => search(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && q.trim()) {
              setOpen(false)
              navigate(`/search?q=${encodeURIComponent(q.trim())}`)
            }
          }}
        />
        {q && (
          <button
            onClick={() => { setQ(''); setResults([]); setOpen(false) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gov-faint hover:text-gov-ink"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-9 left-0 right-0 bg-white border border-gov-border rounded-lg shadow-gov z-50 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-3 text-xs text-gov-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gov-muted">No matches found</p>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                className="px-4 py-2.5 hover:bg-gov-wash cursor-pointer border-b border-gov-border last:border-0"
                onClick={() => pick(r)}
              >
                <div className="flex items-center gap-2">
                  <span className="gov-tag bg-gov-wash text-gov-navy border-gov-border">
                    {r.cell ? `Cell ${r.cell}` : 'Person'}
                  </span>
                  <span className="text-sm text-gov-ink font-semibold">{r.name || r.id}</span>
                </div>
                <p className="text-xs text-gov-muted mt-0.5 truncate font-mono">
                  {r.id}{r.role ? ` · ${r.role}` : ''}{r.phone ? ` · ${r.phone}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
