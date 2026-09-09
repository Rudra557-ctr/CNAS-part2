import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { searchPeople } from '../api/client'

interface Hit {
  id: string
  name: string
  cell?: string
  role?: string
  phone?: string
  account?: string
}

export default function GlobalSearch() {
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
      const { data } = await searchPeople(val.trim())
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
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input-dark pl-8 pr-8 h-8 text-xs"
          placeholder="Search suspects, phones, accounts, locations…"
          value={q}
          onChange={e => search(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true) }}
        />
        {q && (
          <button
            onClick={() => { setQ(''); setResults([]); setOpen(false) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-9 left-0 right-0 bg-dark-700 border border-dark-500 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-3 text-xs text-gray-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500">No matches found</p>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                className="px-4 py-2.5 hover:bg-dark-600 cursor-pointer border-b border-dark-600 last:border-0"
                onClick={() => pick(r)}
              >
                <div className="flex items-center gap-2">
                  <span className="badge-person">{r.cell ? `Cell ${r.cell}` : 'Person'}</span>
                  <span className="text-sm text-white font-medium">{r.name || r.id}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate font-mono">
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
