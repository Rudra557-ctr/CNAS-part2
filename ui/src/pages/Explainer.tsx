import { useState, useEffect, useRef } from 'react'
import { Share2, ArrowLeftRight, Phone, Wallet, FileText, Eye, Brain, Users, Network, Hash, Pin } from 'lucide-react'
import { searchPeople, explainConnection, pinDossierBlock } from '../api/client'

interface Person {
  id: string
  name: string
  role?: string
  cell?: string
  phone?: string
  account?: string
}

interface ExplainData {
  source_person: Person
  target_person: Person
  relationship_strength?: string
  strength_badge?: string
  evidence_score?: number
  story_synopsis?: string
  telephony?: {
    total_calls?: number
    total_duration_minutes?: number
    calls_src_to_dst?: number
    calls_dst_to_src?: number
    active_days_count?: number
    top_cell_towers?: string[]
    sample_records?: any[]
  }
  financials?: {
    total_transactions?: number
    total_amount_inr?: number
    amount_src_to_dst?: number
    amount_dst_to_src?: number
    sample_records?: any[]
  }
  police_cases?: any[]
  surveillance?: any[]
  intelligence?: any[]
  mutual_associates?: Person[]
  direct_graph_edges?: any[]
}

// One-click demo pairs for the 8-minute pitch:
// strong direct tie · cross-cell bridge link · financial tie
const DEMO_PAIRS: Array<{ label: string; sub: string; src: string; dst: string }> = [
  { label: 'Kingpin ↔ Lieutenant', sub: 'A1 ↔ A2 · strong communication tie', src: 'A1', dst: 'A2' },
  { label: 'Cross-cell bridge',    sub: 'A1 ↔ B1 · linked via courier X3',    src: 'A1', dst: 'B1' },
]

// Minimal **bold** renderer for the story synopsis (no markdown dep needed).
function Synopsis({ text }: { text: string }) {
  const parts = text.split('**')
  return (
    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="text-white">{p}</strong> : <span key={i}>{p}</span>))}
    </p>
  )
}

function EntityPicker({
  label, value, onPick,
}: {
  label: string
  value: Person | null
  onPick: (p: Person) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Person[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const search = async (val: string) => {
    setQ(val)
    if (!val.trim()) { setHits([]); setOpen(false); return }
    setBusy(true); setOpen(true)
    try {
      const { data } = await searchPeople(val.trim())
      setHits(data.results || [])
    } catch { setHits([]) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex-1">
      <label className="text-xs text-gray-400 block mb-1.5">{label}</label>
      {value ? (
        <div className="flex items-center gap-3 bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {(value.name || value.id)[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{value.name || value.id}</p>
            <p className="text-[11px] text-gray-500 font-mono truncate">
              {value.id}{value.role ? ` · ${value.role}` : ''}{value.cell ? ` · Cell ${value.cell}` : ''}
            </p>
          </div>
          <button onClick={() => { onPick(null as unknown as Person); setQ('') }} className="text-xs text-gray-500 hover:text-white flex-shrink-0">
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className="input-dark"
            placeholder="Type a name, ID, phone…"
            value={q}
            onChange={e => search(e.target.value)}
          />
          {open && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-dark-700 border border-dark-500 rounded-lg shadow-2xl z-30 max-h-56 overflow-y-auto">
              {busy ? (
                <p className="px-4 py-3 text-xs text-gray-500">Searching…</p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-500">No matches</p>
              ) : hits.map(h => (
                <div
                  key={h.id}
                  className="px-4 py-2 hover:bg-dark-600 cursor-pointer"
                  onClick={() => { onPick(h); setOpen(false); setQ('') }}
                >
                  <p className="text-sm text-white">{h.name || h.id}</p>
                  <p className="text-[11px] text-gray-500 font-mono">{h.id}{h.role ? ` · ${h.role}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const badgeStyle = (b?: string) =>
  b === 'green'  ? 'text-green-400 border-green-500/30 bg-green-500/10'
  : b === 'red'  ? 'text-red-400 border-red-500/30 bg-red-500/10'
  : b === 'yellow' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
  : 'text-gray-300 border-dark-500 bg-dark-700'

export default function Explainer() {
  const [src, setSrc] = useState<Person | null>(null)
  const [dst, setDst] = useState<Person | null>(null)
  const [srcId, setSrcId] = useState('')
  const [dstId, setDstId] = useState('')
  const [data, setData] = useState<ExplainData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [pinMsg, setPinMsg] = useState('')
  const paired = useRef(false)

  // Deep-link from Federated Search evidence rows.
  useEffect(() => {
    if (paired.current) return
    paired.current = true
    try {
      const raw = sessionStorage.getItem('explainPair')
      if (!raw) return
      sessionStorage.removeItem('explainPair')
      const { src, dst } = JSON.parse(raw)
      if (src && dst) run(src, dst)
    } catch { /* ignore malformed handoff */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (a?: string, b?: string) => {
    const s = a || src?.id || srcId.trim()
    const d = b || dst?.id || dstId.trim()
    if (!s || !d) { setErr('Select two entities to explain.'); return }
    setLoading(true); setErr(''); setData(null); setPinMsg('')
    try {
      const { data } = await explainConnection(s, d)
      setData(data)
      // Populate header cards from the authoritative response
      if (data.source_person) setSrc(data.source_person)
      if (data.target_person) setDst(data.target_person)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Could not explain this pair.')
    } finally { setLoading(false) }
  }

  const swap = () => {
    setSrc(dst); setDst(src)
    setSrcId(dst?.id || ''); setDstId(src?.id || '')
    setData(null)
  }

  const pinExplainer = async () => {
    if (!data) return
    const cid = sessionStorage.getItem('caseId')
    if (!cid) { setPinMsg('Open a case graph first, then pin.'); return }
    setPinMsg('')
    try {
      await pinDossierBlock(cid, {
        kind: 'explainer',
        title: `${data.source_person.name} ↔ ${data.target_person.name}`,
        src: data.source_person.id, dst: data.target_person.id,
        snapshot: {
          relationship_strength: data.relationship_strength,
          evidence_score: data.evidence_score,
        },
      })
      setPinMsg('Pinned to the case dossier.')
      setTimeout(() => setPinMsg(''), 4000)
    } catch (e: any) {
      setPinMsg(e.response?.data?.detail || 'Pin failed.')
    }
  }

  const t = data?.telephony
  const f = data?.financials
  const edges = data?.direct_graph_edges || []

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Share2 size={20} className="text-cyan-400" />
          Why Connected?
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Select two suspects to reveal the full evidence chain linking them — calls, money, cases, and mutual associates.
        </p>
      </div>

      {/* Demo shortcuts */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-gray-500 self-center mr-1">Try:</span>
        {DEMO_PAIRS.map(p => (
          <button
            key={p.label}
            onClick={() => run(p.src, p.dst)}
            className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            {p.label} <span className="text-gray-500">· {p.sub}</span>
          </button>
        ))}
      </div>

      {/* Pickers */}
      <div className="card p-4">
        <div className="flex gap-3 items-end">
          <EntityPicker label="Entity A" value={src} onPick={p => { setSrc(p); setSrcId(p?.id || '') }} />
          <button onClick={swap} title="Swap entities" className="btn-ghost p-2.5 mb-0.5 flex-shrink-0">
            <ArrowLeftRight size={16} />
          </button>
          <EntityPicker label="Entity B" value={dst} onPick={p => { setDst(p); setDstId(p?.id || '') }} />
        </div>
        {/* Raw-ID fallback (e.g. paste X3 from a mutual-associate chip) */}
        <div className="flex gap-2 mt-3">
          <input className="input-dark flex-1 font-mono text-xs" placeholder="…or type raw ID (e.g. X3)" value={srcId} onChange={e => setSrcId(e.target.value)} />
          <input className="input-dark flex-1 font-mono text-xs" placeholder="…or type raw ID (e.g. B1)" value={dstId} onChange={e => setDstId(e.target.value)} />
          <button onClick={() => run()} disabled={loading} className="btn-primary disabled:opacity-50 flex-shrink-0">
            {loading ? 'Analysing…' : 'Explain link'}
          </button>
        </div>
        {err && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{err}</p>}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-500 font-mono">Tracing evidence chain…</p>
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Verdict header */}
          <div className="card p-5 border border-cyan-500/20">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  {(data.source_person.name || '?')[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{data.source_person.name}</p>
                  <p className="text-[11px] text-gray-500 font-mono">{data.source_person.id} · Cell {data.source_person.cell}</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Network size={18} className="text-cyan-400" />
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeStyle(data.strength_badge)}`}>
                  score {data.evidence_score ?? 0}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-1 min-w-[200px] justify-end text-right">
                <div>
                  <p className="text-sm font-bold text-white">{data.target_person.name}</p>
                  <p className="text-[11px] text-gray-500 font-mono">{data.target_person.id} · Cell {data.target_person.cell}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  {(data.target_person.name || '?')[0]}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-dark-600">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeStyle(data.strength_badge)}`}>
                  {data.relationship_strength || 'Unknown relationship'}
                </span>
                <button onClick={pinExplainer} className="btn-ghost card text-xs py-1.5" title="Pin this analysis into the open case dossier">
                  <Pin size={12} /> {pinMsg || 'Pin to dossier'}
                </button>
              </div>
              {data.story_synopsis && <Synopsis text={data.story_synopsis} />}
            </div>
          </div>

          {/* Telephony + Financials */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Phone size={14} className="text-blue-400" /> Telephony
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                {[
                  { v: t?.total_calls ?? 0, l: 'total calls' },
                  { v: t?.total_duration_minutes ?? 0, l: 'minutes' },
                  { v: t?.active_days_count ?? 0, l: 'active days' },
                ].map(s => (
                  <div key={s.l} className="bg-dark-700 rounded-lg p-2.5">
                    <p className="text-lg font-mono font-bold text-white">{s.v}</p>
                    <p className="text-[10px] text-gray-500">{s.l}</p>
                  </div>
                ))}
              </div>
              {(t?.top_cell_towers?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {t!.top_cell_towers!.map(tw => <span key={tw} className="badge-location">{tw}</span>)}
                </div>
              )}
              {(t?.sample_records?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  {t!.sample_records!.slice(0, 3).map((c: any) => (
                    <div key={c.call_id} className="bg-dark-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 flex justify-between gap-2">
                      <span className="text-blue-400">{c.call_id}</span>
                      <span className="truncate">{c.caller_id} → {c.callee_id}</span>
                      <span className="text-gray-500 flex-shrink-0">day {c.day} · {c.duration_sec}s</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Wallet size={14} className="text-green-400" /> Financial trail
              </h3>
              <div className="grid grid-cols-2 gap-2 text-center mb-3">
                <div className="bg-dark-700 rounded-lg p-2.5">
                  <p className="text-lg font-mono font-bold text-white">{f?.total_transactions ?? 0}</p>
                  <p className="text-[10px] text-gray-500">transactions</p>
                </div>
                <div className="bg-dark-700 rounded-lg p-2.5">
                  <p className="text-lg font-mono font-bold text-white">₹{((f?.total_amount_inr ?? 0) / 100000).toFixed(1)}L</p>
                  <p className="text-[10px] text-gray-500">total value</p>
                </div>
              </div>
              {(f?.sample_records?.length ?? 0) > 0 ? (
                <div className="space-y-1.5">
                  {f!.sample_records!.slice(0, 3).map((tx: any, i: number) => (
                    <div key={i} className="bg-dark-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 flex justify-between gap-2">
                      <span className="text-green-400">{tx.txn_id || tx.id || 'TXN'}</span>
                      <span className="truncate">{tx.sender_id || tx.src} → {tx.receiver_id || tx.dst}</span>
                      <span className="text-gray-500 flex-shrink-0">₹{tx.amount_inr ?? tx.amount ?? '—'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-600">No direct transactions between this pair.</p>
              )}
            </div>
          </div>

          {/* FIRs */}
          {(data.police_cases?.length ?? 0) > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <FileText size={14} className="text-yellow-400" /> Co-named in police cases ({data.police_cases!.length})
              </h3>
              <div className="space-y-2">
                {data.police_cases!.slice(0, 4).map((c: any) => (
                  <div key={c.fir_id} className="bg-dark-700 rounded-lg p-3 border border-yellow-500/20">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-yellow-400">{c.fir_id}</span>
                      <span className="text-[10px] text-gray-500">{c.date} · {c.station}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-mono mb-1">{c.ipc_sections} · {c.location}</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{c.narrative_excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Surveillance + Intel */}
          {((data.surveillance?.length ?? 0) + (data.intelligence?.length ?? 0)) > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {(data.surveillance?.length ?? 0) > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Eye size={14} className="text-orange-400" /> Surveillance ({data.surveillance!.length})
                  </h3>
                  {data.surveillance!.slice(0, 3).map((s: any, i: number) => (
                    <p key={i} className="text-xs text-gray-300 bg-dark-700 rounded-lg p-2.5 mb-1.5">
                      {s.activity_notes || s.details || JSON.stringify(s).slice(0, 140)}
                    </p>
                  ))}
                </div>
              )}
              {(data.intelligence?.length ?? 0) > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Brain size={14} className="text-purple-400" /> Intelligence ({data.intelligence!.length})
                  </h3>
                  {data.intelligence!.slice(0, 3).map((s: any, i: number) => (
                    <p key={i} className="text-xs text-gray-300 bg-dark-700 rounded-lg p-2.5 mb-1.5">
                      {s.narrative || s.details || JSON.stringify(s).slice(0, 140)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mutual associates */}
          {(data.mutual_associates?.length ?? 0) > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Users size={14} className="text-pink-400" /> Mutual associates ({data.mutual_associates!.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.mutual_associates!.map(m => (
                  <button
                    key={m.id}
                    title="Explain via this associate"
                    onClick={() => run(data!.source_person.id, m.id)}
                    className="flex items-center gap-2 bg-dark-700 border border-dark-500 hover:border-pink-500 rounded-full pl-1 pr-3 py-1 transition-colors"
                  >
                    <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-xs font-bold">
                      {(m.name || m.id)[0]}
                    </span>
                    <span className="text-xs text-white">{m.name || m.id}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{m.id}{m.cell ? ` · ${m.cell}` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Evidence chain */}
          {edges.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Hash size={14} className="text-gray-400" /> Direct evidence chain ({edges.length} edges)
              </h3>
              <div className="space-y-2">
                {edges.slice(0, 8).map((e: any, i: number) => (
                  <div key={i} className="bg-dark-700 rounded-lg p-3 font-mono text-xs">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-bold">{e.src} → {e.dst}</span>
                      <span className="badge-person">{e.kind}</span>
                      <span className="text-gray-500">src: {e.source} · day {e.day ?? '—'}</span>
                      <span className="ml-auto text-gray-500">conf {e.confidence ?? '—'}</span>
                    </div>
                    {e.supporting_text && <p className="text-gray-300 font-sans text-xs">{e.supporting_text}</p>}
                    {e.evidence_hash && (
                      <p className="text-[10px] text-gray-600 mt-1">hash {e.evidence_hash} · {e.extractor || 'graph'}</p>
                    )}
                  </div>
                ))}
                {edges.length > 8 && (
                  <p className="text-xs text-gray-500 text-center">+{edges.length - 8} more edges in chain</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
