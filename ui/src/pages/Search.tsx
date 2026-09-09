import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search as SearchIcon, User, Phone, Wallet, MapPin, FileText,
  Link2, ChevronRight,
} from 'lucide-react'
import { searchPeople, fetchGraph, fetchTowers } from '../api/client'
import type { GraphNode, GraphEdge } from '../types'

interface Tower { tower_id: string; tower_name?: string; name?: string }

interface Groups {
  people: any[]
  phones: GraphNode[]
  accounts: GraphNode[]
  places: Array<GraphNode | { id: string; label: string; kind: string }>
  reports: GraphNode[]
  evidence: GraphEdge[]
}

const EMPTY: Groups = { people: [], phones: [], accounts: [], places: [], reports: [], evidence: [] }

export default function Search() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') || ''
  const [q, setQ] = useState(initial)
  const [groups, setGroups] = useState<Groups>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState('')

  const run = async (term: string) => {
    const query = term.trim()
    if (!query) return
    setParams({ q: query })
    setLoading(true)
    try {
      const [people, graph, towers] = await Promise.all([
        searchPeople(query).then(r => r.data.results || []).catch(() => []),
        fetchGraph().then(r => r.data).catch(() => null),
        fetchTowers().then(r => r.data.towers || []).catch(() => []),
      ])
      const ql = query.toLowerCase()
      const hit = (s: unknown) => String(s || '').toLowerCase().includes(ql)
      const g: Groups = { people, phones: [], accounts: [], places: [], reports: [], evidence: [] }
      if (graph) {
        for (const n of (graph.nodes || []) as GraphNode[]) {
          const kind = n.kind || ''
          if (kind === 'Person') continue // covered by /people/search with richer rows
          if (kind === 'Phone' && (hit(n.id) || hit(n.label))) g.phones.push(n)
          else if (kind === 'Account' && (hit(n.id) || hit(n.label))) g.accounts.push(n)
          else if (kind === 'Location' && (hit(n.id) || hit(n.label))) g.places.push(n)
          else if ((kind === 'FIR' || kind === 'Surveillance' || kind === 'Intel') && (hit(n.id) || hit(n.label))) g.reports.push(n)
        }
        g.evidence = ((graph.edges || []) as GraphEdge[]).filter(e =>
          hit(e.supporting_text) || hit(e.source) || hit(e.src) || hit(e.dst),
        ).slice(0, 20)
      }
      for (const t of towers as Tower[]) {
        const name = t.tower_name || t.name || t.tower_id
        if (hit(name) || hit(t.tower_id)) g.places.push({ id: t.tower_id, label: name, kind: 'Tower' })
      }
      setGroups(g)
      setSearched(query)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (initial) { setQ(initial); run(initial) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const focusInGraph = (id: string) => {
    sessionStorage.setItem('focusNode', id)
    navigate('/graph')
  }

  const explainPair = (src: string, dst: string) => {
    sessionStorage.setItem('explainPair', JSON.stringify({ src, dst }))
    navigate('/explain')
  }

  const total = groups.people.length + groups.phones.length + groups.accounts.length
    + groups.places.length + groups.reports.length + groups.evidence.length

  const groupCard = (
    title: string, icon: React.ReactNode, items: any[], empty: string,
    render: (item: any, i: number) => React.ReactNode,
  ) => (
    <div className="gov-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">{icon}{title}</h2>
        <span className="text-[11px] font-mono text-gov-muted bg-gov-wash px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      {items.length === 0
        ? <p className="text-xs text-gov-faint">{empty}</p>
        : <div className="space-y-1.5">{items.slice(0, 8).map(render)}</div>}
    </div>
  )

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <SearchIcon size={20} className="text-gov-navy" />
          Federated Search
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">One query across persons, phones, accounts, places, reports and evidence mentions.</p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); run(q) }}
      >
        <input
          className="gov-input flex-1"
          placeholder="Try a name, phone, account, tower, FIR id, or keyword…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button type="submit" disabled={loading || !q.trim()} className="gov-btn disabled:opacity-50 flex-shrink-0">
          <SearchIcon size={14} /> {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gov-navy border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && searched && (
        <>
          <p className="text-xs text-gov-muted">
            <b className="text-gov-ink font-mono">{total}</b> hits for <b className="text-gov-ink">“{searched}”</b> across 6 sources
          </p>
          <div className="grid grid-cols-2 gap-4 items-start">
            {groupCard('Persons', <User size={14} className="text-gov-red" />, groups.people, 'No matching persons.',
              (p: any) => (
                <button key={p.id} onClick={() => focusInGraph(p.id)}
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gov-ink font-semibold truncate">{p.name || p.id}</p>
                    <p className="text-[10px] text-gov-muted font-mono truncate">{p.id}{p.role ? ` · ${p.role}` : ''}{p.phone ? ` · ${p.phone}` : ''}</p>
                  </div>
                  <ChevronRight size={13} className="text-gov-faint flex-shrink-0" />
                </button>
              ))}
            {groupCard('Phones', <Phone size={14} className="text-blue-700" />, groups.phones, 'No matching phones.',
              (n: GraphNode) => (
                <button key={n.id} onClick={() => focusInGraph(n.id)}
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors font-mono text-xs text-gov-ink truncate">
                  {n.label || n.id}
                </button>
              ))}
            {groupCard('Accounts', <Wallet size={14} className="text-gov-igreen" />, groups.accounts, 'No matching accounts.',
              (n: GraphNode) => (
                <button key={n.id} onClick={() => focusInGraph(n.id)}
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors font-mono text-xs text-gov-ink truncate">
                  {n.label || n.id}
                </button>
              ))}
            {groupCard('Places & Towers', <MapPin size={14} className="text-orange-700" />, groups.places, 'No matching places.',
              (n: any, i: number) => (
                <button key={`${n.id}-${i}`} onClick={() => n.kind === 'Tower' ? navigate('/map') : focusInGraph(n.id)}
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors">
                  <p className="text-xs text-gov-ink font-medium truncate">{n.label || n.id}</p>
                  <p className="text-[10px] text-gov-muted font-mono">{n.kind}</p>
                </button>
              ))}
            {groupCard('FIRs & Reports', <FileText size={14} className="text-amber-700" />, groups.reports, 'No matching reports.',
              (n: GraphNode) => (
                <button key={n.id} onClick={() => focusInGraph(n.id)}
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors">
                  <p className="text-xs text-gov-ink font-semibold font-mono">{n.id}</p>
                  <p className="text-[10px] text-gov-muted truncate">{n.label} · {n.kind}</p>
                </button>
              ))}
            {groupCard('Evidence mentions', <Link2 size={14} className="text-gov-navy" />, groups.evidence, 'No evidence text mentions.',
              (e: GraphEdge, i: number) => (
                <button key={i} onClick={() => explainPair(e.src, e.dst)}
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors">
                  <p className="text-[11px] font-mono text-gov-navy">{e.src} → {e.dst}</p>
                  <p className="text-[11px] text-gov-muted truncate mt-0.5">{e.supporting_text || e.source}</p>
                  <p className="text-[10px] text-gov-faint font-mono mt-0.5">{e.kind} · {e.source}</p>
                </button>
              ))}
          </div>
        </>
      )}

      {!loading && !searched && (
        <div className="gov-card p-8 text-center">
          <SearchIcon size={28} className="mx-auto mb-3 text-gov-faint" />
          <p className="text-sm text-gov-ink font-medium">Search the whole case foundation at once</p>
          <p className="text-xs text-gov-muted mt-1">Analyst tip: paste a phone number from a CDR to see every record that touches it.</p>
        </div>
      )}
    </div>
  )
}
