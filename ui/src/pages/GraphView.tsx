import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import ForceGraph2D from 'react-force-graph-2d'
import {
  fetchGraph, fetchWhy, fetchCommunities, fetchBridges,
  fetchInvGraph, fetchInvWhy, fetchInvCommunities,
  patchEntity, mergeEntities, fetchEntityHistory, pinDossierBlock,
  fetchAnnotations, postAnnotation, deleteAnnotation,
} from '../api/client'
import type { GraphData, GraphNode, GraphEdge, Community } from '../types'
import {
  X, ZoomIn, ZoomOut, RefreshCw, Info, FileText, Hash,
  Users, Maximize, Minimize, Pencil, History, GitMerge, Pin,
  MessageSquare, Trash2,
} from 'lucide-react'
import { useAuth } from '../components/AuthContext'

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
  const { username } = useAuth()
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
  const [history,   setHistory]     = useState<any[]>([])
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
    setHistory([]); setEditMode(false); setMergeArmed(false)
    setComments([]); setCommentText('')
    setGraphData(null); setCommunities([]); setCommLoaded(false); setBridges(new Set())
    fitted.current = false
  }

  // ── Community mode ────────────────────────────────────────────────────────
  const [mode, setMode]             = useState<'network' | 'community'>('network')
  const [communities, setCommunities] = useState<Community[]>([])
  const [commLoaded, setCommLoaded] = useState(false)
  const [activeComm, setActiveComm] = useState<string | number | null>(null)

  // ── Curation (edit / merge) state ───────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [editVals, setEditVals] = useState({ label: '', role: '', cell: '' })
  const [editBusy, setEditBusy] = useState(false)
  const [editErr,  setEditErr]  = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [mergeArmed,  setMergeArmed]  = useState(false)
  const [mergeMsg,    setMergeMsg]    = useState('')
  const [actionMsg,   setActionMsg]   = useState('')
  const [pinMsg,      setPinMsg]      = useState('')
  // ── Node discussion thread ────────────────────────────────────────────────
  const [comments,    setComments]    = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)

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
    setHistory([])
    setEditMode(false); setEditErr(''); setMergeArmed(false); setMergeMsg(''); setActionMsg('')
    setPinMsg('')
    setComments([]); setCommentText('')
    const cid = sessionStorage.getItem('caseId') || undefined
    const p = cid ? fetchInvWhy(cid, node.id) : fetchWhy(node.id)
    p.then(r => setWhySignals(r.data.top_signals || []))
     .catch(() => setWhySignals([]))
    const h = fetchEntityHistory(node.id, cid)
    h.then(r => setHistory(r.data.events || []))
     .catch(() => setHistory([]))
    fetchAnnotations({ target_type: 'node', target_id: node.id, ...(cid ? { iid: cid } : {}) })
      .then(r => setComments(r.data.comments || []))
      .catch(() => setComments([]))
  }, [])

  const postComment = async () => {
    if (!selected || !commentText.trim()) return
    const cid = sessionStorage.getItem('caseId') || undefined
    setCommentBusy(true)
    try {
      const { data } = await postAnnotation(
        { target_type: 'node', target_id: selected.id, text: commentText.trim() }, cid)
      setComments(c => [...c, data])
      setCommentText('')
    } catch (e: any) {
      setActionMsg(e.response?.data?.detail || 'Could not post comment.')
    } finally { setCommentBusy(false) }
  }

  const removeComment = async (commentId: string) => {
    const cid = sessionStorage.getItem('caseId') || undefined
    try {
      await deleteAnnotation(commentId, cid)
      setComments(c => c.filter(x => x.id !== commentId))
    } catch (e: any) {
      setActionMsg(e.response?.data?.detail || 'Could not delete comment.')
    }
  }

  // Reload graph data and (re)select one node — used after curation writes.
  const refreshAndSelect = async (id: string | null) => {
    const cid = sessionStorage.getItem('caseId')
    setLoading(true)
    try {
      const { data } = cid ? await fetchInvGraph(cid) : await fetchGraph()
      setGraphData(data)
      if (id) {
        const n = (data.nodes || []).find((x: GraphNode) => x.id === id)
        if (n) selectNode(n)
        else { setSelected(null); setActionMsg(`Entity ${id} is no longer on the canvas.`) }
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const saveEdits = async () => {
    if (!selected) return
    const cid = sessionStorage.getItem('caseId') || undefined
    setEditBusy(true); setEditErr('')
    try {
      const orig = { label: selected.label || '', role: selected.role || '', cell: selected.cell || '' }
      for (const f of ['label', 'role', 'cell'] as const) {
        const v = editVals[f].trim()
        if (v && v !== orig[f]) await patchEntity(selected.id, f, v, cid)
      }
      setEditMode(false)
      await refreshAndSelect(selected.id)
    } catch (e: any) {
      setEditErr(e.response?.data?.detail || 'Save failed.')
    } finally { setEditBusy(false) }
  }

  const runMerge = async () => {
    if (!selected || !mergeTarget.trim()) return
    if (!mergeArmed) { setMergeArmed(true); setMergeMsg(''); return }
    const cid = sessionStorage.getItem('caseId') || undefined
    setMergeMsg('')
    try {
      await mergeEntities(mergeTarget.trim(), selected.id, cid)
      setMergeArmed(false); setMergeTarget('')
      await refreshAndSelect(mergeTarget.trim())
    } catch (e: any) {
      setMergeMsg(e.response?.data?.detail || 'Merge failed.')
      setMergeArmed(false)
    }
  }

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
      analyst_edited: n.analyst_edited, analyst_override: n.analyst_override,
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

  const clearSel = () => {
    setSelected(null); setSelEdge(null); setWhySignals([]); setFocus(null)
    setHistory([]); setEditMode(false); setEditErr(''); setMergeArmed(false); setMergeMsg(''); setActionMsg('')
    setPinMsg(''); setComments([]); setCommentText('')
  }

  const pinEntity = async () => {
    if (!selected) return
    const cid = sessionStorage.getItem('caseId')
    if (!cid) { setPinMsg('Open a case graph to pin into its dossier.'); return }
    setPinMsg('')
    try {
      await pinDossierBlock(cid, {
        kind: 'entity', title: selected.label || selected.id, entity_id: selected.id,
        snapshot: { label: selected.label, cell: selected.cell, role: selected.role },
      })
      setPinMsg('Pinned to the case dossier.')
    } catch (e: any) {
      setPinMsg(e.response?.data?.detail || 'Pin failed.')
    }
  }

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
          <div className="flex rounded-full overflow-hidden border border-gov-border shadow-gov">
            {(['network', 'community'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setActiveComm(null) }}
                className={`text-xs px-3 py-1 capitalize transition-all ${
                  mode === m ? 'bg-gov-navy text-white' : 'bg-white/90 text-gov-muted hover:text-gov-ink'
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
              className={`text-xs px-2.5 py-1 rounded-full border shadow-gov transition-all capitalize ${
                filter === k
                  ? 'bg-gov-navy border-gov-navy text-white'
                  : 'bg-white/90 border-gov-border text-gov-muted hover:text-gov-ink'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Zoom / fullscreen controls */}
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
          <button onClick={() => zoom(0.7)}  className="p-1.5 rounded-lg bg-white border border-gov-border shadow-gov text-gov-muted hover:text-gov-ink"><ZoomIn  size={14} /></button>
          <button onClick={() => zoom(1.4)}  className="p-1.5 rounded-lg bg-white border border-gov-border shadow-gov text-gov-muted hover:text-gov-ink"><ZoomOut size={14} /></button>
          <button onClick={loadGraph}         className="p-1.5 rounded-lg bg-white border border-gov-border shadow-gov text-gov-muted hover:text-gov-ink"><RefreshCw size={14} /></button>
          <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded-lg bg-white border border-gov-border shadow-gov text-gov-muted hover:text-gov-ink" title="Toggle fullscreen">
            {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 gov-card p-2 space-y-1 max-h-56 overflow-y-auto">
          {mode === 'network' ? (
            Object.entries(KIND_COLOR).map(([k, c]) => (
              <div key={k} className="flex items-center gap-2 text-[10px] font-medium text-gov-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                {k}
              </div>
            ))
          ) : !commLoaded ? (
            <p className="text-[10px] text-gov-muted px-1">Loading clusters…</p>
          ) : communities.length === 0 ? (
            <p className="text-[10px] text-gov-muted px-1">No clusters found for this scope.</p>
          ) : (
            communities.map((c, i) => (
              <button
                key={c.community_id}
                onClick={() => setActiveComm(a => a === c.community_id ? null : c.community_id)}
                className={`flex items-center gap-2 text-[10px] font-medium px-1.5 py-1 rounded w-full text-left transition-colors ${
                  activeComm === c.community_id ? 'bg-gov-navy text-white' : 'text-gov-muted hover:bg-gov-wash hover:text-gov-ink'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length] }} />
                <span>C{c.community_id} · {c.size} members{c.dominant_cell ? ` · ${c.dominant_cell}` : ''}</span>
              </button>
            ))
          )}
        </div>

        {/* Scope / hint */}
        <div className="absolute top-3 right-3 z-10 gov-card px-2.5 py-1 flex items-center gap-2">
          {caseId ? (
            <>
              <span className="text-[10px] text-gov-navy font-mono font-semibold">Case: {caseName || caseId}</span>
              <button onClick={clearScope} title="Back to global graph" className="text-gov-faint hover:text-gov-ink">
                <X size={12} />
              </button>
            </>
          ) : (
            <p className="text-[10px] text-gov-muted">Click a node for profile · click a link for its source record</p>
          )}
        </div>

        {/* Focus bar */}
        {focus && (
          <div className="absolute top-14 right-3 z-10 gov-card px-2.5 py-1.5 flex items-center gap-2">
            <span className="text-[10px] text-gov-muted font-mono">Focused: {labelOf(focus.id)} ({focus.hops}-hop)</span>
            <button onClick={() => setFocus(null)} className="text-gov-faint hover:text-gov-ink">
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
            <div className="text-center max-w-xs gov-card p-6">
              <Info size={28} className="mx-auto mb-3 text-gov-faint" />
              <p className="text-sm text-gov-ink font-semibold">No graph available</p>
              <p className="text-xs text-gov-muted mt-1">
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
        <div className={`w-80 gov-card p-4 overflow-y-auto space-y-4 ${fullscreen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-gov-ink flex items-center gap-2">
                <FileText size={16} className="text-amber-600" />
                Source Record
              </h3>
              <span className="badge-person mt-1 inline-block">{selEdge.kind}</span>
            </div>
            <button onClick={() => setSelEdge(null)} className="text-gov-faint hover:text-gov-ink">
              <X size={16} />
            </button>
          </div>

          <div className="gov-well p-3 text-center">
            <p className="text-xs font-medium text-gov-muted">{labelOf(selEdge.src)}</p>
            <p className="text-[10px] font-mono text-gov-faint my-0.5">— {selEdge.kind} · {SOURCE_LABEL[(selEdge.source_type || '').toLowerCase()] || selEdge.source_type || 'linked record'} —</p>
            <p className="text-xs font-medium text-gov-muted">{labelOf(selEdge.dst)}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gov-muted mb-1">Source document</p>
            <div className="gov-well p-3 space-y-1.5">
              {edgeSourceDoc(selEdge).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-gov-muted">{k}</span>
                  <span className="text-gov-ink font-mono">{String(v ?? '—')}</span>
                </div>
              ))}
            </div>
          </div>

          {selEdge.supporting_text && (
            <div>
              <p className="text-xs font-semibold text-gov-muted mb-1">Supporting evidence</p>
              <p className="text-xs text-gov-ink gov-well p-3 leading-relaxed">{selEdge.supporting_text}</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs font-mono text-gov-faint">
            <Hash size={11} />
            <span>{selEdge.evidence_hash || 'no hash'} · conf {selEdge.confidence ?? '—'} · {selEdge.extractor || 'graph'}</span>
          </div>
        </div>
      ) : selected ? (
        <div className={`w-72 gov-card p-4 overflow-y-auto space-y-4 ${fullscreen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between">
            <div className="flex gap-3 items-center">
              <img
                src={`/api/mugshots/${selected.id}.jpg`}
                alt=""
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                className="w-11 h-11 rounded-lg object-cover border border-gov-border flex-shrink-0 bg-gov-wash"
              />
              <div>
                <h3 className="text-base font-bold text-gov-ink">{selected.label}</h3>
                <span className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`badge-${(selected.kind || 'person').toLowerCase()} inline-block`}>
                    {selected.kind}
                  </span>
                  {selected.analyst_edited && (
                    <span className="gov-tag bg-amber-50 text-amber-700 border-amber-200">Analyst-edited</span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex gap-2 -mt-2">
              <button
                onClick={() => {
                  setEditMode(m => !m); setEditErr('')
                  setEditVals({ label: selected.label || '', role: selected.role || '', cell: selected.cell || '' })
                }}
                className="gov-ghost border border-gov-border flex-1 justify-center text-xs py-1.5"
              >
                <Pencil size={12} /> {editMode ? 'Cancel edit' : 'Edit entity'}
              </button>
              <button
                onClick={pinEntity}
                className="gov-ghost border border-gov-border flex-1 justify-center text-xs py-1.5"
                title="Pin this entity into the open case dossier"
              >
                <Pin size={12} /> Pin to dossier
              </button>
            </div>
            {pinMsg && (
              <p className="text-[11px] text-gov-muted -mt-1">{pinMsg}</p>
            )}
            {actionMsg && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{actionMsg}</p>
            )}
            {editMode && (
              <div className="gov-well p-3 space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-gov-muted">Display name</label>
                  <input className="gov-input mt-0.5" value={editVals.label}
                    onChange={e => setEditVals(v => ({ ...v, label: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gov-muted">Role</label>
                    <input className="gov-input mt-0.5" value={editVals.role}
                      onChange={e => setEditVals(v => ({ ...v, role: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gov-muted">Cell</label>
                    <input className="gov-input mt-0.5" value={editVals.cell}
                      onChange={e => setEditVals(v => ({ ...v, cell: e.target.value }))} />
                  </div>
                </div>
                {editErr && <p className="text-[11px] text-gov-red">{editErr}</p>}
                <button onClick={saveEdits} disabled={editBusy} className="gov-btn w-full justify-center py-1.5 disabled:opacity-50">
                  {editBusy ? 'Saving…' : 'Save changes'}
                </button>
                <p className="text-[10px] text-gov-faint">Edits layer over source data — originals are never modified.</p>
              </div>
            )}
            <button onClick={() => { setSelected(null); setWhySignals([]) }} className="text-gov-faint hover:text-gov-ink">
              <X size={16} />
            </button>
          </div>

          {selected.risk_score !== undefined && (
            <div className="gov-well p-3">
              <p className="text-xs text-gov-muted mb-1">Risk Score</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gov-border rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gov-red transition-all"
                    style={{ width: `${Math.min(selected.risk_score, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-mono font-bold text-gov-red">{selected.risk_score}</span>
              </div>
            </div>
          )}

          {selected.cell && (
            <div>
              <p className="text-xs text-gov-muted mb-1">Criminal Cell{selected.role ? ` · ${selected.role}` : ''}</p>
              <p className="text-sm text-gov-ink font-mono gov-well px-2 py-1">{selected.cell}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setFocus({ id: selected.id, hops: 1 })} className="gov-ghost border border-gov-border flex-1 justify-center text-xs py-1.5">1-Hop</button>
            <button onClick={() => setFocus({ id: selected.id, hops: 2 })} className="gov-ghost border border-gov-border flex-1 justify-center text-xs py-1.5">2-Hop</button>
          </div>

          <div className="gov-well p-3 space-y-2">
            <p className="text-xs font-semibold text-gov-muted flex items-center gap-1.5">
              <GitMerge size={12} /> Merge duplicate into…
            </p>
            <div className="flex gap-2">
              <input
                className="gov-input flex-1 font-mono !py-1.5"
                placeholder="Keep ID, e.g. N6"
                value={mergeTarget}
                onChange={e => { setMergeTarget(e.target.value); setMergeArmed(false); setMergeMsg('') }}
              />
              <button
                onClick={runMerge}
                disabled={!mergeTarget.trim()}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 flex-shrink-0 ${
                  mergeArmed
                    ? 'bg-gov-red text-white border-gov-red'
                    : 'bg-white text-gov-ink border-gov-border hover:border-gov-navy'
                }`}
              >
                {mergeArmed ? 'Confirm?' : 'Merge'}
              </button>
            </div>
            {mergeArmed && (
              <p className="text-[11px] text-amber-700">
                {selected.id} will be absorbed into {mergeTarget.trim()}. Its links re-point; the record stays in history.
              </p>
            )}
            {mergeMsg && <p className="text-[11px] text-gov-red">{mergeMsg}</p>}
          </div>

          {whySignals.length > 0 && (
            <div>
              <p className="text-xs text-gov-muted mb-1 flex items-center gap-1">
                <Info size={11} /> Why flagged
              </p>
              <ul className="text-xs text-gov-ink gov-well p-3 leading-relaxed space-y-1.5 list-disc list-inside">
                {whySignals.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs text-gov-muted mb-1 flex items-center gap-1">
              <History size={11} /> Curation history
            </p>
            {history.length === 0 ? (
              <p className="text-[11px] text-gov-faint">No analyst edits yet — machine values.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className="gov-well px-3 py-2 text-[11px]">
                    {h.kind === 'override' ? (
                      <p className="text-gov-ink">
                        <span className="font-mono font-semibold">{h.field}</span>
                        {': '}{String(h.old_value ?? '—')} → <b>{String(h.new_value)}</b>
                      </p>
                    ) : (
                      <p className="text-gov-ink">
                        {h.drop_id === selected.id
                          ? <>Absorbed into <b className="font-mono">{h.keep_id}</b></>
                          : <>Absorbed <b className="font-mono">{h.drop_id}</b></>}
                      </p>
                    )}
                    <p className="text-gov-faint font-mono mt-0.5">
                      {h.updated_by || h.merged_by} · {new Date(h.updated_at || h.merged_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-gov-muted mb-1 flex items-center gap-1">
              <MessageSquare size={11} /> Discussion
              <span className="text-[10px] font-mono text-gov-faint bg-gov-wash px-1.5 py-0.5 rounded-full">{comments.length}</span>
            </p>
            {comments.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {comments.map(c => (
                  <div key={c.id} className="gov-well px-3 py-2">
                    <p className="text-xs text-gov-ink whitespace-pre-line">{c.text}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-gov-faint font-mono">
                        {c.created_by} · {new Date(c.created_at).toLocaleString('en-IN')}
                      </p>
                      {(c.created_by === username) && (
                        <button onClick={() => removeComment(c.id)} className="text-gov-faint hover:text-gov-red" title="Delete comment">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                className="gov-input flex-1 !py-1.5 text-xs"
                placeholder="Discuss this entity… (Enter to post)"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') postComment() }}
              />
              <button onClick={postComment} disabled={commentBusy || !commentText.trim()}
                className="gov-btn !px-3 !py-1.5 text-xs disabled:opacity-50 flex-shrink-0">
                Post
              </button>
            </div>
          </div>
        </div>
      ) : activeComm != null ? (
        <div className={`w-72 gov-card p-4 overflow-y-auto space-y-3 ${fullscreen ? 'hidden' : ''}`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-gov-ink flex items-center gap-2">
                <Users size={16} className="text-gov-igreen" />
                Cluster C{activeComm}
              </h3>
              <p className="text-xs text-gov-muted mt-0.5">
                {communities.find(c => String(c.community_id) === String(activeComm))?.size} members
                {communities.find(c => String(c.community_id) === String(activeComm))?.dominant_cell
                  ? ` · ${communities.find(c => String(c.community_id) === String(activeComm))?.dominant_cell}-dominant` : ''}
              </p>
            </div>
            <button onClick={() => setActiveComm(null)} className="text-gov-faint hover:text-gov-ink">
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
                  className="w-full text-left px-3 py-2 rounded-lg gov-well hover:border-gov-navy transition-colors"
                >
                  <p className="text-xs text-gov-ink font-semibold truncate">{n?.label || id}</p>
                  <p className="text-[10px] text-gov-muted font-mono">{id}{n?.kind ? ` · ${n.kind}` : ''}{n?.cell ? ` · Cell ${n.cell}` : ''}</p>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className={`w-72 gov-card p-4 flex flex-col items-center justify-center text-center ${fullscreen ? 'hidden' : ''}`}>
          <Info size={24} className="mb-2 text-gov-faint" />
          <p className="text-sm text-gov-ink font-medium">Click any node</p>
          <p className="text-xs text-gov-muted mt-1">profile · or any link for its source record</p>
        </div>
      )}
    </div>
  )
}
