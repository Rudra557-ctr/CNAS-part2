import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import ForceGraph2D from 'react-force-graph-2d'
import {
  fetchGraph, fetchWhy, fetchCommunities, fetchBridges,
  fetchInvGraph, fetchInvWhy, fetchInvCommunities,
} from '../api/client'
import type { GraphData, GraphNode, GraphEdge, Community } from '../types'
import {
  X, ZoomIn, ZoomOut, RefreshCw, Info, FileText, Hash,
  Users, Maximize, Minimize,
} from 'lucide-react'

// Node colour by type (Palantir colour convention, matches previous UI)
const KIND_COLOR: Record<string, string> = {
  Person:       '#ef4444',
  Phone:        '#3b82f6',
  Account:      '#22c55e',
  Location:     '#f97316',
  Vehicle:      '#a855f7',
  Organization: '#06b6d4',
  Post:         '#94a3b8',
  FIR:          '#eab308',
  Surveillance: '#fb923c',
  Intel:        '#c084fc',
}

const KIND_SIZE: Record<string, number> = {
  Person: 10, Phone: 7, Account: 7, Location: 8, Vehicle: 6, Organization: 9,
}

// Distinct palette for community colouring
const COMMUNITY_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#a855f7',
  '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#84cc16',
]

const DIM = '#2a3655'
const DIM_LINK = '#1c2640'
const BRIDGE_GOLD = '#FFC53D'
const BG = '#0A0E14'

// Human-readable source-type labels for the evidence panel
const SOURCE_LABEL: Record<string, string> = {
  cdr: 'Call Detail Record',
  transaction: 'Financial Transaction',
  fir: 'First Information Report',
  surveillance: 'Surveillance Report',
  intel: 'Intelligence Report',
  social_post: 'Social Media Post',
  criminal_history: 'Criminal History Record',
  people_directory: 'People Directory',
}

const idOf = (v: unknown): string =>
  typeof v === 'object' && v !== null ? String((v as { id: unknown }).id) : String(v)

export default function GraphView() {
  const fgRef   = useRef<any>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fitted  = useRef(false)

  // WebGL available? Otherwise fall back to the 2D force graph (same engine family).
  const [use3D] = useState(() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch { return false }
  })

  const [graphData, setGraphData]   = useState<GraphData | null>(null)
  const [bridges, setBridges]       = useState<Set<string>>(new Set())
  const [selected,  setSelected]    = useState<GraphNode | null>(null)
  const [selEdge,   setSelEdge]     = useState<GraphEdge | null>(null)
  const [whySignals, setWhySignals] = useState<string[]>([])
  const [loading,   setLoading]     = useState(true)
  const [loadError, setLoadError]   = useState('')
  const [filter,    setFilter]      = useState<string>('all')
  const [fullscreen, setFullscreen] = useState(false)
  const [size, setSize] = useState({ w: 800, h: 600 })

  // ── Optional case scope (set by CaseDetail → "Open case graph") ─────────────
  const [caseId, setCaseId] = useState<string | null>(() => sessionStorage.getItem('caseId'))
  const [caseName, setCaseName] = useState<string>(() => sessionStorage.getItem('caseName') || '')

  const clearScope = () => {
    sessionStorage.removeItem('caseId'); sessionStorage.removeItem('caseName')
    setCaseId(null); setCaseName('')
    setSelected(null); setSelEdge(null); setActiveComm(null); setFocus(null)
    setGraphData(null); setCommunities([]); setCommLoaded(false); setBridges(new Set())
    fitted.current = false
  }

  // ── Community mode ────────────────────────────────────────────────────────
  const [mode, setMode]             = useState<'network' | 'community'>('network')
  const [communities, setCommunities] = useState<Community[]>([])
  const [commLoaded, setCommLoaded] = useState(false)
  const [activeComm, setActiveComm] = useState<string | number | null>(null)

  // ── 1-hop / 2-hop focus ───────────────────────────────────────────────────
  const [focus, setFocus] = useState<{ id: string; hops: number } | null>(null)

  // ── Measured canvas size (follows fullscreen + window resizes) ─────────────
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect
      setSize({ w: Math.max(Math.floor(r.width), 100), h: Math.max(Math.floor(r.height), 100) })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [fullscreen])

  const selectNode = useCallback((node: GraphNode) => {
    setSelected(node)
    setSelEdge(null)
    setWhySignals([])
    const cid = sessionStorage.getItem('caseId')
    const p = cid ? fetchInvWhy(cid, node.id) : fetchWhy(node.id)
    p.then(r => setWhySignals(r.data.top_signals || []))
     .catch(() => setWhySignals([]))
  }, [])

  // ── Load graph (+ bridges for gold links) ───────────────────────────────────
  const loadGraph = useCallback(async () => {
    setLoading(true); setLoadError('')
    fitted.current = false
    try {
      const cid = sessionStorage.getItem('caseId')
      const [{ data }, b] = await Promise.all([
        cid ? fetchInvGraph(cid) : fetchGraph(),
        (cid ? fetchBridges(cid) : fetchBridges()).catch(() => ({ data: [] })),
      ])
      setGraphData(data)
      const arr: any[] = Array.isArray(b.data) ? b.data : (b.data.bridges || [])
      setBridges(new Set(arr.filter(x => x.flagged !== false).map(x => x.id)))
    } catch (e: any) {
      console.error(e)
      setLoadError(e.response?.status === 403
        ? 'Graph viewing is restricted to investigator and supervisor roles.'
        : 'Could not load the graph.')
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph, caseId])

  useEffect(() => {
    if (mode === 'community' && !commLoaded) {
      const cid = sessionStorage.getItem('caseId')
      const p = cid ? fetchInvCommunities(cid) : fetchCommunities()
      p.then(r => setCommunities(Array.isArray(r.data) ? r.data : []))
       .catch(() => setCommunities([]))
       .finally(() => setCommLoaded(true))
    }
  }, [mode, commLoaded])

  const nodeToComm = useMemo(() => {
    const m = new Map<string, number>()
    communities.forEach((c, i) => (c.members || []).forEach(id => m.set(id, i)))
    return m
  }, [communities])

  const activeMembers = useMemo(() => {
    if (activeComm == null) return null
    const c = communities.find(x => String(x.community_id) === String(activeComm))
    return c ? new Set(c.members || []) : null
  }, [communities, activeComm])

  // ── Force-graph data (filtered nodes + incident links) ─────────────────────
  const fgData = useMemo(() => {
    if (!graphData) return { nodes: [] as any[], links: [] as any[] }
    const nodes = (filter === 'all'
      ? graphData.nodes
      : graphData.nodes.filter(n => (n.kind || '').toLowerCase() === filter)
    ).map(n => ({ ...n, name: n.label || n.id }))
    const keep = new Set(nodes.map(n => n.id))
    const links = graphData.edges
      .filter(e => keep.has(e.src) && keep.has(e.dst))
      .map(e => ({ ...e, source: e.src, target: e.dst }))
    return { nodes, links }
  }, [graphData, filter])

  // ── Focus neighbourhood ────────────────────────────────────────────────────
  const focusSet = useMemo(() => {
    if (!focus) return null
    const adj = new Map<string, Set<string>>()
    const add = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set())
      adj.get(a)!.add(b)
    }
    fgData.links.forEach(l => {
      const s = idOf(l.source), t = idOf(l.target)
      add(s, t); add(t, s)
    })
    const seen = new Set([focus.id])
    let frontier = [focus.id]
    for (let h = 0; h < focus.hops; h++) {
      const next: string[] = []
      frontier.forEach(id => (adj.get(id) || new Set()).forEach(nb => {
        if (!seen.has(nb)) { seen.add(nb); next.push(nb) }
      }))
      frontier = next
    }
    return seen
  }, [focus, fgData])

  // ── Colouring ──────────────────────────────────────────────────────────────
  const colorOf = useCallback((n: any): string => {
    if (focusSet && !focusSet.has(String(n.id))) return DIM
    if (activeMembers && !activeMembers.has(String(n.id))) return DIM
    if (mode === 'community') {
      const ci = nodeToComm.get(String(n.id))
      return ci !== undefined ? COMMUNITY_COLORS[ci % COMMUNITY_COLORS.length] : DIM
    }
    return KIND_COLOR[n.kind] || '#888'
  }, [focusSet, activeMembers, mode, nodeToComm])

  const linkDim = useCallback((l: any): boolean => {
    const s = idOf(l.source), t = idOf(l.target)
    if (focusSet && (!focusSet.has(s) || !focusSet.has(t))) return true
    if (activeMembers && (!activeMembers.has(s) || !activeMembers.has(t))) return true
    return false
  }, [focusSet, activeMembers])

  const isBridgeLink = useCallback((l: any): boolean => {
    const s = idOf(l.source), t = idOf(l.target)
    return bridges.has(s) || bridges.has(t)
  }, [bridges])

  // ── Deep-link from global search ───────────────────────────────────────────
  useEffect(() => {
    if (!graphData) return
    const focusId = sessionStorage.getItem('focusNode')
    if (!focusId) return
    sessionStorage.removeItem('focusNode')
    const n = graphData.nodes.find(x => x.id === focusId)
    if (n) {
      selectNode(n)
      setTimeout(() => {
        try {
          const cur: any[] = (fgRef.current?.graphData?.() as any)?.nodes || []
          const target = cur.find(x => String(x.id) === focusId)
          if (target && target.x !== undefined) fgRef.current?.centerAt?.(target.x, target.y, 800)
        } catch { /* engine not settled yet */ }
      }, 1500)
    }
  }, [graphData, selectNode])

  const zoom = (d: number) => {
    try {
      if (use3D) {
        const pos = fgRef.current?.cameraPosition?.()
        if (pos) fgRef.current.cameraPosition({ x: pos.x, y: pos.y, z: pos.z * d }, pos.lookAt, 300)
      } else {
        fgRef.current?.zoom?.(1 / d, 300)
      }
    } catch { /* ignore */ }
  }

  const labelOf = (id: string) => graphData?.nodes.find(n => n.id === id)?.label || id

  const edgeSourceDoc = (e: GraphEdge) => {
    const st = (e.source_type || '').toLowerCase()
    if (st === 'cdr') {
      const m: any = e.meta || {}
      return [
        ['Record', e.source], ['Tower', m.tower], ['Duration', m.duration_sec ? `${m.duration_sec}s` : '—'],
        ['Call type', m.call_type || '—'], ['Day', e.day ?? '—'],
      ]
    }
    if (st === 'transaction') {
      const m: any = e.meta || {}
      return [
        ['Record', e.source], ['Amount', m.amount ?? '—'], ['Type', m.txn_type ?? '—'],
        ['Day', e.day ?? '—'],
      ]
    }
    return [['Record', e.source], ['Day', e.day ?? '—']]
  }

  const onNodeClick = (n: any) => {
    selectNode({
      id: String(n.id), label: n.name || n.label || String(n.id),
      kind: n.kind, cell: n.cell, role: n.role, risk_score: n.risk_score,
    })
  }

  const onLinkClick = (l: any) => {
    const s = idOf(l.source), t = idOf(l.target)
    const e = (graphData?.edges || []).find(x => x.src === s && x.dst === t && x.kind === l.kind)
      || (graphData?.edges || []).find(x => x.src === s && x.dst === t)
    if (!e) return
    setSelEdge({ ...e })
    setSelected(null); setWhySignals([])
  }

  const clearSel = () => { setSelected(null); setSelEdge(null); setWhySignals([]); setFocus(null) }

  const kinds = ['all', 'person', 'phone', 'account', 'location', 'vehicle']
  // `any`: 2D and 3D components accept the shared props used below.
  const Graph3D: any = use3D ? ForceGraph3D : ForceGraph2D

  return (
    <div className={`flex gap-4 ${fullscreen ? '' : 'h-[calc(100vh-7rem)]'}`}>

      {/* Graph container */}
      <div
        ref={wrapRef}
        className={`flex-1 card overflow-hidden relative ${fullscreen ? 'fixed inset-0 z-[60] rounded-none' : ''}`}
        style={fullscreen ? { background: BG } : { background: BG, minHeight: 420 }}
      >
        {/* Mode + filter bar */}
        <div className="absolute top-3 left-3 z-10 flex gap-1.5 flex-wrap items-center">
          <div className="flex rounded-full overflow-hidden border border-dark-500">
            {(['network', 'community'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setActiveComm(null) }}
                className={`text-xs px-3 py-1 capitalize transition-all ${
                  mode === m ? 'bg-blue-500 text-white' : 'bg-dark-800/80 text-gray-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === 'network' && kinds.map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all capitalize ${
                filter === k
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-dark-800/80 border-dark-500 text-gray-400 hover:text-white'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Zoom / fullscreen controls */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
          <button onClick={() => zoom(0.7)}  className="btn-ghost p-1.5 card"><ZoomIn  size={14} /></button>
          <button onClick={() => zoom(1.4)}  className="btn-ghost p-1.5 card"><ZoomOut size={14} /></button>
          <button onClick={loadGraph}         className="btn-ghost p-1.5 card"><RefreshCw size={14} /></button>
          <button onClick={() => setFullscreen(f => !f)} className="btn-ghost p-1.5 card" title="Toggle fullscreen">
            {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 card p-2 space-y-1 max-h-56 overflow-y-auto">
          {mode === 'network' ? (
            Object.entries(KIND_COLOR).map(([k, c]) => (
              <div key={k} className="flex items-center gap-2 text-[10px] text-gray-400">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                {k}
              </div>
            ))
          ) : !commLoaded ? (
            <p className="text-[10px] text-gray-500 px-1">Loading clusters…</p>
          ) : communities.length === 0 ? (
            <p className="text-[10px] text-gray-500 px-1">No clusters found for this scope.</p>
          ) : (
            communities.map((c, i) => (
              <button
                key={c.community_id}
                onClick={() => setActiveComm(a => a === c.community_id ? null : c.community_id)}
                className={`flex items-center gap-2 text-[10px] px-1.5 py-1 rounded w-full text-left transition-colors ${
                  activeComm === c.community_id ? 'bg-dark-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length] }} />
                <span>C{c.community_id} · {c.size} members{c.dominant_cell ? ` · ${c.dominant_cell}` : ''}</span>
              </button>
            ))
          )}
        </div>

        {/* Scope / hint */}
        <div className="absolute top-3 right-3 z-10 card px-2.5 py-1 flex items-center gap-2">
          {caseId ? (
            <>
              <span className="text-[10px] text-cyan-400 font-mono">Case: {caseName || caseId}</span>
              <button onClick={clearScope} title="Back to global graph" className="text-gray-500 hover:text-white">
                <X size={12} />
              </button>
            </>
          ) : (
            <p className="text-[10px] text-gray-500">Click a node for profile · click a link for its source record</p>
          )}
        </div>

        {/* Focus bar */}
        {focus && (
          <div className="absolute top-14 right-3 z-10 card px-2.5 py-1.5 flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-mono">Focused: {labelOf(focus.id)} ({focus.hops}-hop)</span>
            <button onClick={() => setFocus(null)} className="text-gray-500 hover:text-white">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Loading / empty */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: 'rgba(10,14,20,.85)' }}>
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400 font-mono">Building network graph…</p>
            </div>
          </div>
        )}

        {!loading && !graphData && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="text-center text-gray-500 max-w-xs">
              <Info size={28} className="mx-auto mb-3 text-gray-700" />
              <p className="text-sm text-gray-300">No graph available</p>
              <p className="text-xs mt-1">
                {loadError || (caseId
                  ? 'This case has no built graph yet — open the case and run analysis first.'
                  : 'The shared graph has not been built yet.')}
              </p>
            </div>
          </div>
        )}

        {graphData && (
          <Graph3D
            ref={fgRef}
            width={size.w}
            height={fullscreen ? size.h : Math.max(size.h, 420)}
            graphData={fgData}
            backgroundColor={BG}
            nodeLabel={(n: any) => `${n.name || n.id} (${n.id})`}
            nodeColor={colorOf}
            nodeRelSize={4}
            nodeVal={(n: any) => (KIND_SIZE[n.kind] || 6) / 6}
            linkColor={(l: any) => linkDim(l) ? DIM_LINK : isBridgeLink(l) ? BRIDGE_GOLD : 'rgba(255,255,255,0.25)'}
            linkWidth={(l: any) => isBridgeLink(l) && !linkDim(l) ? 2 : 1}
            linkDirectionalParticles={(l: any) => isBridgeLink(l) && !linkDim(l) ? 3 : 0}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.006}
            linkLabel={(l: any) => `${idOf(l.source)} ↔ ${idOf(l.target)} · ${(l as any).kind || ''} — click for source record`}
            onNodeClick={onNodeClick}
            onLinkClick={onLinkClick}
            onBackgroundClick={clearSel}
            onNodeHover={(n: any) => { if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'default' }}
            onLinkHover={(l: any) => { if (wrapRef.current) wrapRef.current.style.cursor = l ? 'pointer' : 'default' }}
            onEngineStop={() => { if (!fitted.current) { fitted.current = true; try { fgRef.current?.zoomToFit?.(400) } catch { /* ignore */ } } }}
            cooldownTicks={200}
            enableNodeDrag
          />
        )}
      </div>

      {/* ── Right panel: edge evidence / node profile / community members ── */}
      {selEdge ? (
        <div className={`w-80 card p-4 overflow-y-auto space-y-4 ${fullscreen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText size={16} className="text-yellow-400" />
                Source Record
              </h3>
              <span className="badge-person mt-1 inline-block">{selEdge.kind}</span>
            </div>
            <button onClick={() => setSelEdge(null)} className="text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="bg-dark-700 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400">{labelOf(selEdge.src)}</p>
            <p className="text-[10px] font-mono text-gray-600 my-0.5">— {selEdge.kind} · {SOURCE_LABEL[(selEdge.source_type || '').toLowerCase()] || selEdge.source_type || 'linked record'} —</p>
            <p className="text-xs text-gray-400">{labelOf(selEdge.dst)}</p>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1">Source document</p>
            <div className="bg-dark-700 rounded-lg p-3 space-y-1.5">
              {edgeSourceDoc(selEdge).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-200 font-mono">{String(v ?? '—')}</span>
                </div>
              ))}
            </div>
          </div>

          {selEdge.supporting_text && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Supporting evidence</p>
              <p className="text-xs text-gray-200 bg-dark-700 rounded-lg p-3 leading-relaxed">{selEdge.supporting_text}</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
            <Hash size={11} />
            <span>{selEdge.evidence_hash || 'no hash'} · conf {selEdge.confidence ?? '—'} · {selEdge.extractor || 'graph'}</span>
          </div>
        </div>
      ) : selected ? (
        <div className={`w-72 card p-4 overflow-y-auto space-y-4 ${fullscreen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between">
            <div className="flex gap-3 items-center">
              <img
                src={`/api/mugshots/${selected.id}.jpg`}
                alt=""
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                className="w-11 h-11 rounded-lg object-cover border border-dark-500 flex-shrink-0"
              />
              <div>
                <h3 className="text-base font-bold text-white">{selected.label}</h3>
                <span className={`badge-${(selected.kind || 'person').toLowerCase()} mt-1 inline-block`}>
                  {selected.kind}
                </span>
              </div>
            </div>
            <button onClick={() => { setSelected(null); setWhySignals([]) }} className="text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {selected.risk_score !== undefined && (
            <div className="bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Risk Score</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-dark-600 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all"
                    style={{ width: `${Math.min(selected.risk_score, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-mono font-bold text-red-400">{selected.risk_score}</span>
              </div>
            </div>
          )}

          {selected.cell && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Criminal Cell{selected.role ? ` · ${selected.role}` : ''}</p>
              <p className="text-sm text-white font-mono bg-dark-700 rounded px-2 py-1">{selected.cell}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setFocus({ id: selected.id, hops: 1 })} className="btn-ghost card flex-1 justify-center text-xs py-1.5">1-Hop</button>
            <button onClick={() => setFocus({ id: selected.id, hops: 2 })} className="btn-ghost card flex-1 justify-center text-xs py-1.5">2-Hop</button>
          </div>

          {whySignals.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Info size={11} /> Why flagged
              </p>
              <ul className="text-xs text-gray-300 bg-dark-700 rounded-lg p-3 leading-relaxed space-y-1.5 list-disc list-inside">
                {whySignals.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : activeComm != null ? (
        <div className={`w-72 card p-4 overflow-y-auto space-y-3 ${fullscreen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users size={16} className="text-green-400" />
                Cluster C{activeComm}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {communities.find(c => String(c.community_id) === String(activeComm))?.size} members
                {communities.find(c => String(c.community_id) === String(activeComm))?.dominant_cell
                  ? ` · ${communities.find(c => String(c.community_id) === String(activeComm))?.dominant_cell}-dominant` : ''}
              </p>
            </div>
            <button onClick={() => setActiveComm(null)} className="text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-1.5">
            {(communities.find(c => String(c.community_id) === String(activeComm))?.members || []).map(id => {
              const n = graphData?.nodes.find(x => x.id === id)
              return (
                <button
                  key={id}
                  onClick={() => n && selectNode(n)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
                >
                  <p className="text-xs text-white font-medium truncate">{n?.label || id}</p>
                  <p className="text-[10px] text-gray-500 font-mono">{id}{n?.kind ? ` · ${n.kind}` : ''}{n?.cell ? ` · Cell ${n.cell}` : ''}</p>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className={`w-72 card p-4 flex flex-col items-center justify-center text-center text-gray-500 ${fullscreen ? 'hidden' : ''}`}>
          <Info size={24} className="mb-2 text-gray-600" />
          <p className="text-sm">Click any node</p>
          <p className="text-xs mt-1">profile · or any link for its source record</p>
        </div>
      )}
    </div>
  )
}
