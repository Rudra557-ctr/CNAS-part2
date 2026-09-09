import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Network, AlertTriangle, Users, TrendingUp, Activity, GitBranch, Eye, ArrowRight } from 'lucide-react'
import { fetchGraph, fetchLeads, fetchBridges, fetchAnomalies } from '../api/client'
import type { Lead, Bridge, Anomaly } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats,     setStats]     = useState({ nodes: 0, edges: 0 })
  const [leads,     setLeads]     = useState<Lead[]>([])
  const [bridges,   setBridges]   = useState<Bridge[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    // Independent fetches: one forbidden endpoint (e.g. /graph for analysts)
    // must not blank the panels the role CAN see.
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
    Promise.all([safe(fetchGraph()), safe(fetchLeads()), safe(fetchBridges()), safe(fetchAnomalies())])
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
  }, [])

  // Backend may return lowercase severity/priority; normalize before comparing.
  const riskColor = (level?: string) => {
    const u = (level || '').toUpperCase()
    return u === 'HIGH' ? 'text-red-400' : u === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'
  }

  const riskBg = (level?: string) => {
    const u = (level || '').toUpperCase()
    return u === 'HIGH' ? 'bg-red-500/10 border-red-500/20' : u === 'MEDIUM' ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-green-500/10 border-green-500/20'
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gray-500 font-mono">Loading intelligence…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Analyst Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">AI-powered criminal network intelligence · Real-time analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pulse-dot bg-green-400" />
          <span className="text-xs text-green-400 font-mono">All systems nominal</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Entities',   value: stats.nodes, icon: Users,         color: 'text-blue-400',   sub: 'persons, phones, accounts' },
          { label: 'Connections',      value: stats.edges, icon: Network,        color: 'text-purple-400', sub: 'relationships mapped' },
          { label: 'High-Risk Leads',  value: leads.filter(l => l.priority === 'HIGH').length, icon: TrendingUp, color: 'text-red-400',  sub: 'require immediate action' },
          { label: 'Active Anomalies', value: anomalies.length, icon: AlertTriangle, color: 'text-yellow-400', sub: 'detected this cycle' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{s.label}</span>
              <s.icon size={14} className={s.color} />
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 3-column detail */}
      <div className="grid grid-cols-3 gap-4">

        {/* Top Leads */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-red-400" />
              <h2 className="text-sm font-semibold text-white">Priority Suspects</h2>
            </div>
            <button onClick={() => navigate('/graph')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {leads.map((l, i) => (
              <div key={l.entity_id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${riskBg(l.priority)}`}>
                <span className="text-xs font-mono text-gray-500 w-4">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{l.label}</p>
                  <p className="text-[10px] text-gray-500">{l.cell ? `Cell ${l.cell}` : 'Unknown cell'}{l.role ? ` · ${l.role}` : ''}</p>
                </div>
                <span className={`text-xs font-mono font-bold ${riskColor(l.priority)}`}>
                  {l.lead_score ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bridge Nodes */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Bridge Nodes</h2>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">
            Entities that hold multiple criminal cells together. Arresting a bridge fragments the network.
          </p>
          <div className="space-y-2">
            {bridges.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-700">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{b.name || b.id}</p>
                  <p className="text-[10px] text-gray-500">Connects {b.cells?.length ?? 2}+ cells</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-purple-400">{(b.bridge_score || b.betweenness || 0).toFixed(3)}</p>
                  <p className="text-[10px] text-gray-600">bridge score</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Anomalies */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-yellow-400" />
              <h2 className="text-sm font-semibold text-white">Live Anomalies</h2>
            </div>
            <button onClick={() => navigate('/alerts')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              All alerts <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={i} className={`p-2.5 rounded-lg border ${riskBg(a.severity)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{a.anomaly_type}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{(a as any).explanation || a.description}</p>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${riskBg(a.severity)} ${riskColor(a.severity)} flex-shrink-0`}>
                    {a.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Eye size={14} className="text-cyan-400" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Explore Graph',       to: '/graph',      color: 'border-blue-500/30   hover:border-blue-500   text-blue-400' },
            { label: 'View Movement Map',   to: '/map',        color: 'border-orange-500/30 hover:border-orange-500 text-orange-400' },
            { label: 'Timeline Analysis',   to: '/timeline',   color: 'border-purple-500/30 hover:border-purple-500 text-purple-400' },
            { label: 'Simulate Takedown',   to: '/takedown',   color: 'border-red-500/30    hover:border-red-500    text-red-400' },
            { label: 'Data Connectors',     to: '/connectors', color: 'border-green-500/30  hover:border-green-500  text-green-400' },
          ].map(a => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className={`p-3 rounded-xl border bg-dark-700 text-sm font-medium transition-all ${a.color}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
