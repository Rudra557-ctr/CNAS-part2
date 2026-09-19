import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Play, Pause, RotateCcw, Layers, Eye, GitBranch } from 'lucide-react'
import { fetchGraph, fetchInvGraph, fetchBridges } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import type { GraphData, GraphEdge } from '../types'

// Blindness vs fusion: the same investigation rendered twice from one data pull.
// Left holds a single source the way a siloed agency does; right holds every
// source fused. Both panels compute their own numbers — including the bridge
// count, which is the point of the screen and must never be asserted. Telecom
// genuinely does see the couriers in this dataset; FIRs and surveillance
// genuinely do not, and the page has to be able to show both.

const DAY_MIN = 50
const DAY_MAX = 70

// Ordered blindest first: the default view is the one an investigation actually
// starts from — the police file.
const SOURCES = [
  { id: 'fir',          label: 'FIR records only',   short: 'the police file',
    hint: 'What the police file records on its own',
    missing: 'no call records and no money trail' },
  { id: 'surveillance', label: 'Surveillance only',  short: 'field surveillance',
    hint: 'What the field team logs on its own',
    missing: 'no call records and no money trail' },
  { id: 'social_post',  label: 'Social media only',  short: 'open-source monitoring',
    hint: 'What open-source monitoring picks up alone',
    missing: 'no verified identifiers behind the handles' },
  { id: 'transaction',  label: 'Banking only',       short: 'the bank',
    hint: 'What the bank sees: money, but no meetings',
    missing: 'money movement, but no calls and no meetings' },
  { id: 'cdr',          label: 'Telecom (CDR only)', short: 'the telecom operator',
    hint: 'What the operator sees: calls, but no money trail',
    missing: 'call structure, but no money trail and no case context' },
]

interface PanelData {
  nodes: any[]
  links: any[]
  entities: number      // every entity kind, for coverage
  sources: number
  bridgesSeen: number
}

// Everything drawn here is a Person, so colour carries the cell instead of the
// entity kind — three clusters you can actually tell apart on a projector.
const CELL_COLOR: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e',
  Bridge: '#FFC53D', Noise: '#475569', default: '#64748b',
}
const BRIDGE_GOLD = '#FFC53D'
const BG = '#0A0E14'

// Static relations (directory, ownership) carry no day and are always present.
const visibleOnDay = (e: GraphEdge, day: number) => e.day == null || e.day <= day

export default function Fusion() {
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [graph, setGraph]     = useState<GraphData | null>(null)
  const [bridges, setBridges] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [source, setSource]   = useState('fir')
  const [day, setDay]         = useState(DAY_MIN)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const singleRef = useRef<any>(null)
  const fusedRef  = useRef<any>(null)
  const [panelW, setPanelW]   = useState(500)

  // Both canvases size to half the content column so the pair never clips.
  useEffect(() => {
    const measure = () => {
      const w = wrapRef.current?.clientWidth
      if (w) setPanelW(Math.max(280, Math.floor(w / 2) - 26))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    setLoading(true); setError('')
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
    Promise.all([
      iid ? fetchInvGraph(iid) : fetchGraph(),
      safe(fetchBridges(iid)),
    ])
      .then(([g, b]) => {
        setGraph(g.data)
        const arr: any[] = Array.isArray(b?.data) ? b!.data : (b?.data?.bridges || [])
        setBridges(new Set(arr.filter(x => x.flagged !== false).map(x => x.id)))
      })
      .catch((e: any) => setError(e.response?.status === 403
        ? 'Your role does not have graph access.'
        : 'Could not load the graph.'))
      .finally(() => setLoading(false))
  }, [scopeKey])

  // Playback walks the burst window, then stops at the end.
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setDay(d => {
        if (d >= DAY_MAX) { setPlaying(false); return DAY_MAX }
        return d + 1
      })
    }, 550)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [playing])

  const build = useMemo(() => (onlySource: string | null): PanelData => {
    if (!graph) return { nodes: [], links: [], entities: 0, sources: 0, bridgesSeen: 0 }
    const edges = graph.edges.filter(e =>
      visibleOnDay(e, day) && (!onlySource || e.source_type === onlySource))
    const touched = new Set<string>()
    edges.forEach(e => { touched.add(e.src); touched.add(e.dst) })

    // Draw the person-to-person layer only. Phones, accounts and towers triple
    // the node count and turn both panels into the same unreadable blob; the
    // question on this screen is who is connected to whom.
    const isPerson = new Set(
      graph.nodes.filter(n => n.kind === 'Person' && touched.has(n.id)).map(n => n.id))
    const nodes = graph.nodes.filter(n => isPerson.has(n.id)).map(n => ({ ...n }))
    const personEdges = edges.filter(e => isPerson.has(e.src) && isPerson.has(e.dst))

    return {
      nodes,
      links: personEdges.map(e => ({ ...e, source: e.src, target: e.dst })),
      entities: touched.size,
      sources: new Set(edges.map(e => e.source_type).filter(Boolean)).size,
      bridgesSeen: nodes.filter(n => bridges.has(n.id)).length,
    }
  }, [graph, day, bridges])

  const single = useMemo(() => build(source), [build, source])
  const fused  = useMemo(() => build(null),   [build])

  const Panel = ({ title, subtitle, data, tone, fgRef }: {
    title: string; subtitle: string
    data: PanelData
    tone: 'muted' | 'live'
    fgRef: React.MutableRefObject<any>
  }) => (
    <div className="gov-card overflow-hidden flex flex-col">
      {/* Fixed header height keeps the two canvases on the same baseline even
          when one subtitle wraps to a second line. */}
      <div className="px-4 py-2.5 border-b border-gov-border flex items-start justify-between gap-3 h-[68px]">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">
            {tone === 'live' ? <Layers size={14} className="text-gov-navy" />
                             : <Eye size={14} className="text-gov-muted" />}
            {title}
          </h2>
          <p className="text-[10px] text-gov-muted mt-0.5 line-clamp-2">{subtitle}</p>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border flex-shrink-0 ${
          tone === 'live'
            ? 'bg-green-50 text-gov-igreen border-green-200'
            : 'bg-gray-50 text-gov-muted border-gov-border'}`}>
          {tone === 'live' ? 'ALL SOURCES FUSED' : 'SINGLE SOURCE'}
        </span>
      </div>

      <div style={{ background: BG }} className="relative">
        <ForceGraph2D
          ref={fgRef}
          graphData={{ nodes: data.nodes, links: data.links } as any}
          width={panelW}
          height={340}
          backgroundColor={BG}
          cooldownTicks={60}
          d3VelocityDecay={0.3}
          // Unlinked persons have no force holding them in frame — a source with
          // 0 relationships would otherwise scatter its people off-canvas and
          // look emptier than the count claims.
          onEngineStop={() => fgRef.current?.zoomToFit(300, 24)}
          nodeRelSize={4}
          nodeLabel={(n: any) =>
            `${n.label || n.id}${n.cell ? ` — Cell ${n.cell}` : ''}${n.role ? ` · ${n.role}` : ''}` +
            (bridges.has(n.id) ? ' · BRIDGE' : '')}
          nodeColor={(n: any) =>
            bridges.has(n.id) ? BRIDGE_GOLD : (CELL_COLOR[n.cell] || CELL_COLOR.default)}
          nodeVal={(n: any) => (bridges.has(n.id) ? 6 : 2.5)}
          linkColor={() => (tone === 'live' ? '#31466f' : '#243049')}
          linkWidth={0.6}
          linkDirectionalParticles={tone === 'live' ? 1 : 0}
          linkDirectionalParticleWidth={1.6}
          enableNodeDrag={false}
        />
        {!data.nodes.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-gray-500 font-mono">no data visible by day {day}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 divide-x divide-gov-border border-t border-gov-border">
        {/* "Bridge persons" counts presence, not detection — a source can name
            someone without giving you the structure that identifies them as a
            bridge. Links is the metric that carries that distinction. */}
        {[
          { k: 'Persons',       v: data.nodes.length },
          { k: 'Links',         v: data.links.length },
          { k: 'Sources',       v: data.sources },
          { k: 'Bridge persons', v: data.bridgesSeen },
        ].map(m => (
          <div key={m.k} className="px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-gov-faint">{m.k}</p>
            <p className={`text-base font-bold ${
              m.k === 'Links' ? (tone === 'live' ? 'text-gov-igreen' : 'text-gov-red')
                              : 'text-gov-ink'}`}>{m.v}</p>
          </div>
        ))}
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gov-navy border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="gov-card p-6">
      <p className="text-sm text-gov-ink font-semibold">Fusion view unavailable</p>
      <p className="text-xs text-gov-muted mt-1">{error}</p>
    </div>
  )

  const active = SOURCES.find(s => s.id === source)
  const lift = single.links.length
    ? Math.round(((fused.links.length - single.links.length) / single.links.length) * 100)
    : 0
  const coverage = fused.entities
    ? Math.round((single.entities / fused.entities) * 100)
    : 0
  // Below this, there is not enough structure for centrality to mean anything —
  // the source is a list of names, not a network.
  const sparse = single.links.length < 30

  return (
    <div className="space-y-4" ref={wrapRef}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gov-ink">Blindness vs Fusion</h1>
          <p className="text-xs text-gov-muted mt-0.5">
            One investigation, two viewpoints — a single agency's feed against every source combined
          </p>
        </div>
        {iid && <CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} />}
      </div>

      {/* Controls */}
      <div className="gov-card p-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gov-ink">Siloed source</label>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="gov-input text-xs py-1"
          >
            {SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <button
            onClick={() => setPlaying(p => !p)}
            className="gov-btn text-xs flex items-center gap-1.5 px-3 py-1"
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
            {playing ? 'Pause' : 'Play burst week'}
          </button>
          <button
            onClick={() => { setPlaying(false); setDay(DAY_MIN) }}
            className="gov-ghost text-xs flex items-center gap-1.5 px-2 py-1"
            title="Rewind to day 50"
          >
            <RotateCcw size={12} />
          </button>
          <input
            type="range"
            min={DAY_MIN}
            max={DAY_MAX}
            value={day}
            onChange={e => { setPlaying(false); setDay(Number(e.target.value)) }}
            className="flex-1 accent-gov-navy"
          />
          <span className="text-xs font-mono font-bold text-gov-navy w-16">Day {day}</span>
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-2 gap-4">
        <Panel
          title={active?.label || 'Single source'}
          subtitle={`${active?.hint || ''} · person-to-person links`}
          data={single}
          tone="muted"
          fgRef={singleRef}
        />
        <Panel
          title="CNAS fused graph"
          subtitle="Telecom, banking, FIRs, surveillance and social resolved into one identity graph · person-to-person links"
          data={fused}
          tone="live"
          fgRef={fusedRef}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-gov-muted">
        {[['A', 'Cell A'], ['B', 'Cell B'], ['C', 'Cell C'], ['Noise', 'Unaffiliated']].map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: CELL_COLOR[k] }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: BRIDGE_GOLD }} />
          Bridge entity (flagged by analytics)
        </span>
      </div>

      {/* Read-out */}
      <div className="gov-card p-4">
        <div className="flex items-start gap-3">
          <GitBranch size={16} className="text-gov-navy mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gov-ink leading-relaxed">
            <p>
              By day {day}, {active?.short} alone names{' '}
              <strong>{single.nodes.length} persons</strong> and yields{' '}
              {sparse && 'only '}
              <strong className={sparse ? 'text-gov-red' : ''}>
                {single.links.length} relationships
              </strong>{' '}
              between them, covering <strong>{coverage}%</strong> of the {fused.entities} entities
              in the full graph.{' '}
              {sparse ? (
                <>
                  {single.bridgesSeen > 0 && (
                    <>It names <strong>{single.bridgesSeen} of the {fused.bridgesSeen} bridge
                    persons</strong>, but naming someone is not identifying them: </>
                  )}
                  betweenness needs structure, and this source carries almost none —{' '}
                  {active?.missing}.
                </>
              ) : (
                <>
                  That is real structure, and it names{' '}
                  <strong>{single.bridgesSeen} of the {fused.bridgesSeen} bridge persons</strong> —
                  but it is one channel: {active?.missing}. A ranking built on it inherits that
                  blind spot.
                </>
              )}
            </p>
            <p className="mt-1.5">
              Fused, the same investigation reaches{' '}
              <strong>{fused.nodes.length} persons</strong> over{' '}
              <strong className="text-gov-igreen">{fused.links.length} relationships</strong>
              {lift > 0 && <> (<strong className="text-gov-igreen">+{lift}%</strong>)</>} drawn from{' '}
              <strong>{fused.sources} evidence sources</strong>. That is the structure that makes{' '}
              <strong className="text-amber-600">{fused.bridgesSeen} bridge entities</strong>
              {' '}computable at all — they are in gold. No single source supports the analysis on
              its own, which is the case for fusing them.
            </p>
            <p className="mt-1.5 text-gov-muted">
              Investigative leads only — not determinations of guilt. Both panels render the same
              evidence records; only the source filter differs. Every figure above is counted from
              the graph on screen, not asserted.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
