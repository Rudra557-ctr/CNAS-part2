import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Network, AlertTriangle, Users, TrendingUp, Activity, GitBranch, Eye, ArrowRight } from 'lucide-react'
import { fetchGraph, fetchInvGraph, fetchLeads, fetchBridges, fetchAnomalies } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import type { Lead, Bridge, Anomaly } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [stats,     setStats]     = useState({ nodes: 0, edges: 0 })
  const [leads,     setLeads]     = useState<Lead[]>([])
  const [bridges,   setBridges]   = useState<Bridge[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)

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
        setLeads(    ((l?.data as any)?.leads      || (l?.data as any) || []).slice(0, 5))
        setBridges(  ((b?.data as any)?.bridges    || (b?.data as any) || []).slice(0, 5))
        setAnomalies(((a?.data as any)?.anomalies  || (a?.data as any) || []).slice(0, 5))
      })
      .finally(() => setLoading(false))
  }, [scopeKey])

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
        <p className="text-xs text-gov-muted font-mono">Loading intelligence…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gov-ink">Analyst Dashboard</h1>
          <p className="text-xs text-gov-muted mt-0.5">Criminal network intelligence · Real-time analysis</p>
        </div>
        <div className="flex items-center gap-2">
          {iid && <CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} />}
          <div className="flex items-center gap-2 gov-card px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-gov-igreen animate-pulse" />
            <span className="text-xs text-gov-igreen font-semibold">All systems nominal</span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Entities',   value: stats.nodes, icon: Users,         color: 'text-gov-navy',   sub: 'persons, phones, accounts' },
          { label: 'Connections',      value: stats.edges, icon: Network,        color: 'text-gov-navy', sub: 'relationships mapped' },
          { label: 'High-Risk Leads',  value: leads.filter(l => prio(l.priority) === 'HIGH').length, icon: TrendingUp, color: 'text-gov-red',  sub: 'require immediate action' },
          { label: 'Active Anomalies', value: anomalies.length, icon: AlertTriangle, color: 'text-gov-saffron', sub: 'detected this cycle' },
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
              <h2 className="text-sm font-bold text-gov-ink">Priority Suspects</h2>
            </div>
            <button onClick={() => navigate('/graph')} className="text-xs text-gov-navy hover:underline flex items-center gap-1 font-medium">
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {leads.map((l, i) => (
              <div key={l.entity_id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${prioBox(l.priority)}`}>
                <span className="text-xs font-mono text-gov-faint w-4">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gov-ink font-semibold truncate">{l.label}</p>
                  <p className="text-[10px] text-gov-muted">{l.cell ? `Cell ${l.cell}` : 'Unknown cell'}{l.role ? ` · ${l.role}` : ''}</p>
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
            <h2 className="text-sm font-bold text-gov-ink">Bridge Nodes</h2>
          </div>
          <p className="text-[10px] text-gov-muted mb-3">
            Entities holding multiple criminal cells together. Removing a bridge fragments the network.
          </p>
          <div className="space-y-2">
            {bridges.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg gov-well">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gov-ink font-medium truncate">{b.name || b.id}</p>
                  <p className="text-[10px] text-gov-muted">Connects {b.cells?.length ?? 2}+ cells</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono font-bold text-gov-navy">{(b.bridge_score || b.betweenness || 0).toFixed(3)}</p>
                  <p className="text-[10px] text-gov-faint">bridge score</p>
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
              <h2 className="text-sm font-bold text-gov-ink">Live Anomalies</h2>
            </div>
            <button onClick={() => navigate('/alerts')} className="text-xs text-gov-navy hover:underline flex items-center gap-1 font-medium">
              All alerts <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {anomalies.map((a, i) => (
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
          Quick Actions
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Explore Graph',       to: '/graph',      accent: 'text-gov-navy' },
            { label: 'View Movement Map',   to: '/map',        accent: 'text-gov-saffron' },
            { label: 'Timeline Analysis',   to: '/timeline',   accent: 'text-gov-navy' },
            { label: 'Simulate Takedown',   to: '/takedown',   accent: 'text-gov-red' },
            { label: 'Data Connectors',     to: '/connectors', accent: 'text-gov-igreen' },
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
