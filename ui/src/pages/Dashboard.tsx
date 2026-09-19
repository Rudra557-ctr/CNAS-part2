import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Network, AlertTriangle, Users, TrendingUp, Activity, GitBranch, Eye, ArrowRight, FileDown } from 'lucide-react'
import {
  fetchGraph, fetchInvGraph, fetchLeads, fetchBridges, fetchAnomalies,
  fetchBursts, fetchWhy, fetchInvWhy,
} from '../api/client'
import { useAuth } from '../components/AuthContext'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import { useLang } from '../i18n/LanguageContext'
import { exportCaseFilePdf, type WhyPayload } from '../lib/caseFilePdf'
import type { Lead, Bridge, Anomaly } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const { username } = useAuth()
  const { t, lang } = useLang()
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [stats,     setStats]     = useState({ nodes: 0, edges: 0 })
  const [leads,     setLeads]     = useState<Lead[]>([])
  const [bridges,   setBridges]   = useState<Bridge[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    // Independent fetches: one forbidden endpoint (e.g. /graph for analysts)
    // must not blank the panels the role CAN see.
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
    const gReq = iid ? fetchInvGraph(iid) : fetchGraph()
    Promise.all([safe(gReq), safe(fetchLeads(iid)), safe(fetchBridges(iid)), safe(fetchAnomalies(iid))])
      .then(([g, l, b, a]) => {
        // /graph returns stats as {node_count, edge_count}
        const s = g?.data?.stats || {}
        setStats({
          nodes: s.node_count ?? s.nodes ?? g?.data?.nodes?.length ?? 0,
          edges: s.edge_count ?? s.edges ?? g?.data?.edges?.length ?? 0,
        })
        // Keep the full lists — the stat cards count them. Truncating here made
        // "Active Anomalies" report the length of the display list (5) while the
        // API held 26. Slicing happens at render instead.
        setLeads(    ((l?.data as any)?.leads      || (l?.data as any) || []))
        setBridges(  ((b?.data as any)?.bridges    || (b?.data as any) || []))
        setAnomalies(((a?.data as any)?.anomalies  || (a?.data as any) || []))
      })
      .finally(() => setLoading(false))
  }, [scopeKey])

  // One-click case file — pulls the full (unsliced) analytics set plus per-entity
  // evidence from /why, then renders the PDF client-side. Nothing to pin first.
  const exportCaseFile = async () => {
    setExporting(true)
    try {
      const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
      const [l, b, a, bu] = await Promise.all([
        safe(fetchLeads(iid)), safe(fetchBridges(iid)),
        safe(fetchAnomalies(iid)), safe(fetchBursts(iid)),
      ])
      const unwrap = (r: any, key: string): any[] => r?.data?.[key] || r?.data || []
      const allLeads = unwrap(l, 'leads').slice(0, 10)

      const whys: Record<string, WhyPayload> = {}
      await Promise.all(
        allLeads.slice(0, 5).map(x => x.entity_id).filter(Boolean).map(async (id: string) => {
          const r = await safe(iid ? fetchInvWhy(iid, id) : fetchWhy(id))
          if (r?.data) whys[id] = r.data as WhyPayload
        }),
      )

      exportCaseFilePdf({
        caseName: caseName || 'Consolidated network (shared graph)',
        iid: iid || undefined,
        username: username || 'analyst',
        stats,
        leads: allLeads,
        bridges: unwrap(b, 'bridges'),
        bursts: unwrap(bu, 'bursts'),
        anomalies: unwrap(a, 'anomalies'),
        whys,
      })
    } finally {
      setExporting(false)
    }
  }

  // Backend may return lowercase severity/priority; normalize before comparing.
  const prio = (level?: string) => (level || '').toUpperCase()
  const prioText = (level?: string) => {
    const u = prio(level)
    return u === 'HIGH' ? 'text-gov-red' : u === 'MEDIUM' ? 'text-amber-700' : 'text-gov-igreen'
  }
  const prioBox = (level?: string) => {
    const u = prio(level)
    return u === 'HIGH' ? 'bg-red-50 border-red-200' : u === 'MEDIUM' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gov-navy border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gov-muted font-mono">{t('common.loading')}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gov-ink">{t('dash.title')}</h1>
          <p className="text-xs text-gov-muted mt-0.5">{t('dash.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {iid && <CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} />}
          <button
            onClick={exportCaseFile}
            disabled={exporting}
            title="Generate a full case file PDF: leads, evidence basis, bridges, bursts and method"
            className="flex items-center gap-2 gov-card px-3 py-1.5 text-xs font-semibold text-gov-navy hover:border-gov-navy hover:shadow-gov transition-all disabled:opacity-60"
          >
            <FileDown size={13} />
            {exporting ? t('dash.exporting') : t('dash.export')}
          </button>
          <div className="flex items-center gap-2 gov-card px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-gov-igreen animate-pulse" />
            <span className="text-xs text-gov-igreen font-semibold">{t('dash.nominal')}</span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('dash.stat.entities'), value: stats.nodes, icon: Users, color: 'text-gov-navy', sub: t('dash.stat.entities_sub') },
          { label: t('dash.stat.connections'), value: stats.edges, icon: Network, color: 'text-gov-navy', sub: t('dash.stat.connections_sub') },
          { label: t('dash.stat.leads'), value: leads.filter(l => prio(l.priority) === 'HIGH').length, icon: TrendingUp, color: 'text-gov-red', sub: t('dash.stat.leads_sub') },
          { label: t('dash.stat.anomalies'), value: anomalies.length, icon: AlertTriangle, color: 'text-gov-saffron', sub: t('dash.stat.anomalies_sub') },
        ].map(s => (
          <div key={s.label} className="gov-stat">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gov-muted">{s.label}</span>
              <s.icon size={15} className={s.color} />
            </div>
            <p className="text-[26px] font-bold text-gov-ink leading-tight">{s.value}</p>
            <p className="text-[10px] text-gov-faint">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 3-column detail */}
      <div className="grid grid-cols-3 gap-4">

        {/* Top Leads */}
        <div className="gov-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-gov-red" />
              <h2 className="text-sm font-bold text-gov-ink">{t('dash.suspects')}</h2>
            </div>
            <button onClick={() => navigate('/graph')} className="text-xs text-gov-navy hover:underline flex items-center gap-1 font-medium">
              {t('dash.view_all')} <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {leads.slice(0, 5).map((l, i) => (
              <div key={l.entity_id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${prioBox(l.priority)}`}>
                <span className="text-xs font-mono text-gov-faint w-4">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gov-ink font-semibold truncate">
                    {lang === 'hi' && (l as any).label_hi ? (l as any).label_hi : l.label}
                  </p>
                  <p className="text-[10px] text-gov-muted">{l.cell ? `${t('dash.cell')} ${l.cell}` : t('dash.unknown_cell')}{l.role ? ` · ${l.role}` : ''}</p>
                </div>
                <span className={`text-xs font-mono font-bold ${prioText(l.priority)}`}>
                  {l.lead_score ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bridge Nodes */}
        <div className="gov-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch size={14} className="text-gov-navy" />
            <h2 className="text-sm font-bold text-gov-ink">{t('dash.bridges')}</h2>
          </div>
          <p className="text-[10px] text-gov-muted mb-3">
            {t('dash.bridges_help')}
          </p>
          <div className="space-y-2">
            {bridges.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg gov-well">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gov-ink font-medium truncate">{b.name || b.id}</p>
                  <p className="text-[10px] text-gov-muted">{t('dash.bridges_connects')} {b.cells?.length ?? 2}+ {t('dash.bridges_cells')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono font-bold text-gov-navy">{(b.bridge_score || b.betweenness || 0).toFixed(3)}</p>
                  <p className="text-[10px] text-gov-faint">{t('dash.bridge_score')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Anomalies */}
        <div className="gov-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-gov-saffron" />
              <h2 className="text-sm font-bold text-gov-ink">{t('dash.anomalies')}</h2>
            </div>
            <button onClick={() => navigate('/alerts')} className="text-xs text-gov-navy hover:underline flex items-center gap-1 font-medium">
              {t('dash.all_alerts')} <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {anomalies.slice(0, 5).map((a, i) => (
              <div key={i} className={`p-2.5 rounded-lg border ${prioBox(a.severity)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gov-ink truncate">{a.anomaly_type}</p>
                    <p className="text-[10px] text-gov-muted mt-0.5 line-clamp-2">{(a as any).explanation || a.description}</p>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${prioBox(a.severity)} ${prioText(a.severity)}`}>
                    {prio(a.severity)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="gov-card p-4">
        <h2 className="text-sm font-bold text-gov-ink mb-3 flex items-center gap-2">
          <Eye size={14} className="text-gov-navy" />
          {t('dash.quick_actions')}
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: t('dash.qa.graph'), to: '/graph', accent: 'text-gov-navy' },
            { label: t('dash.qa.map'), to: '/map', accent: 'text-gov-saffron' },
            { label: t('dash.qa.timeline'), to: '/timeline', accent: 'text-gov-navy' },
            { label: t('dash.qa.takedown'), to: '/takedown', accent: 'text-gov-red' },
            { label: t('dash.qa.connectors'), to: '/connectors', accent: 'text-gov-igreen' },
          ].map(a => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="p-3 rounded-xl border border-gov-border bg-white hover:border-gov-navy hover:shadow-gov text-sm font-semibold text-gov-ink transition-all"
            >
              <span className={a.accent}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
