import { useEffect, useState } from 'react'
import { fetchAnomalies, fetchBridges, fetchBursts, fetchCrossCase } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import type { Anomaly, Bridge, Burst } from '../types'
import { AlertTriangle, Bell, Activity, GitBranch } from 'lucide-react'

export default function Alerts() {
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [bridges,   setBridges]   = useState<Bridge[]>([])
  const [bursts,    setBursts]    = useState<Burst[]>([])
  const [crossCase, setCrossCase] = useState<any[]>([])
  const [tab, setTab] = useState<'anomaly'|'bridge'|'burst'|'cross'>('anomaly')

  useEffect(() => {
    fetchAnomalies(iid).then(r => setAnomalies(r.data.anomalies || r.data || [])).catch(()=>{})
    fetchBridges(iid)  .then(r => setBridges(r.data.bridges    || r.data || [])).catch(()=>{})
    fetchBursts(iid)   .then(r => setBursts(r.data.bursts      || r.data || [])).catch(()=>{})
    fetchCrossCase(iid).then(r => setCrossCase(r.data.links    || r.data || [])).catch(()=>{})
  }, [scopeKey])

  const TABS = [
    { id: 'anomaly', label: 'Anomalies',    icon: AlertTriangle, count: anomalies.length,  color: 'text-red-400' },
    { id: 'bridge',  label: 'Bridges',      icon: GitBranch,     count: bridges.length,    color: 'text-purple-400' },
    { id: 'burst',   label: 'Call Bursts',  icon: Activity,      count: bursts.length,     color: 'text-yellow-400' },
    { id: 'cross',   label: 'Cross-Case',   icon: Bell,          count: crossCase.length,  color: 'text-cyan-400' },
  ]

  // Backend returns lowercase severity ('high'/'medium'); normalize for display.
  const norm = (s?: string) => (s || '').toUpperCase()
  // Backend burst windows arrive as day ranges, e.g. [-4, 1].
  const fmtWindow = (w: unknown): string =>
    Array.isArray(w) ? `days ${w[0]}…${w[1]}` : String(w ?? '—')

  const sev = (s?: string) => {
    const u = norm(s)
    return u === 'HIGH' ? 'risk-high border' : u === 'MEDIUM' ? 'risk-medium border' : 'risk-low border'
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-white">Alert Centre</h1>
        <p className="text-xs text-gray-500">Automated detections requiring analyst review</p>
        {iid && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
              tab === t.id ? 'bg-dark-600 border-dark-400 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <t.icon size={14} className={t.color} />
            {t.label}
            <span className="text-xs font-mono bg-dark-700 px-1.5 py-0.5 rounded">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {tab === 'anomaly' && anomalies.map((a, i) => (
          <div key={i} className={`card p-4 rounded-xl ${sev(a.severity)}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${sev(a.severity)}`}>{norm(a.severity)}</span>
                  <span className="text-sm font-semibold text-white">{a.anomaly_type}</span>
                </div>
                <p className="text-xs text-gray-400">{(a as any).explanation || a.description}</p>
                {a.entity_name && <p className="text-xs text-blue-400 mt-1 font-mono">Entity: {a.entity_name}</p>}
              </div>
              {a.score != null && (
                <span className="text-2xl font-mono font-bold text-red-400">
                  {typeof a.score === 'number' ? a.score.toFixed(1) : a.score}
                </span>
              )}
            </div>
          </div>
        ))}

        {tab === 'bridge' && bridges.map((b, i) => (
          <div key={i} className="card p-4 border border-purple-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{b.name || b.id}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Connects {b.cells?.join(', ') || 'multiple cells'} · Rank #{b.rank}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-bold text-purple-400">{(b.bridge_score || b.betweenness || 0).toFixed(4)}</p>
                <p className="text-[10px] text-gray-600">bridge score</p>
              </div>
            </div>
          </div>
        ))}

        {tab === 'burst' && bursts.map((b, i) => (
          <div key={i} className="card p-4 border border-yellow-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Cell: {b.cell}</p>
                <p className="text-xs text-gray-500">Day {b.day} · {fmtWindow(b.window)}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-bold text-yellow-400">{b.zscore?.toFixed(2)}σ</p>
                <p className="text-[10px] text-gray-600">{b.count} calls</p>
              </div>
            </div>
          </div>
        ))}

        {tab === 'cross' && crossCase.map((c: any, i) => (
          <div key={i} className="card p-4 border border-cyan-500/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white font-mono">{c.shared_entity}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Shared across {(c.cases || []).length} case{(c.cases || []).length === 1 ? '' : 's'}
                  {(c.cases || []).length > 0 ? `: ${(c.cases || []).join(', ')}` : ''}
                </p>
                {c.relationship_path && (
                  <p className="text-xs text-cyan-400 mt-1">{c.relationship_path}</p>
                )}
              </div>
              {c.confidence != null && (
                <span className="text-lg font-mono font-bold text-cyan-400 flex-shrink-0">
                  {typeof c.confidence === 'number' ? c.confidence.toFixed(2) : c.confidence}
                </span>
              )}
            </div>
          </div>
        ))}

        {(tab === 'anomaly' && anomalies.length === 0) ||
         (tab === 'bridge' && bridges.length === 0) ||
         (tab === 'burst' && bursts.length === 0) ||
         (tab === 'cross' && crossCase.length === 0) ? (
          <div className="text-center py-12 text-gray-500">
            <Bell size={32} className="mx-auto mb-2 text-gray-700" />
            <p>No alerts in this category</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
