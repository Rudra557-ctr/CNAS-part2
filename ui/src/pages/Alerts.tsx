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
    { id: 'anomaly', label: 'Anomalies',    icon: AlertTriangle, count: anomalies.length,  color: 'text-gov-red' },
    { id: 'bridge',  label: 'Bridges',      icon: GitBranch,     count: bridges.length,    color: 'text-purple-700' },
    { id: 'burst',   label: 'Call Bursts',  icon: Activity,      count: bursts.length,     color: 'text-yellow-600' },
    { id: 'cross',   label: 'Cross-Case',   icon: Bell,          count: crossCase.length,  color: 'text-cyan-700' },
  ]

  // Backend returns lowercase severity ('high'/'medium'); normalize for display.
  const norm = (s?: string) => (s || '').toUpperCase()
  // Backend burst windows arrive as day ranges, e.g. [-4, 1].
  const fmtWindow = (w: unknown): string =>
    Array.isArray(w) ? `days ${w[0]}…${w[1]}` : String(w ?? '—')

  // Light-safe severity tones for the gov theme (the legacy risk-* classes
  // are translucent dark-theme tints and wash out on white).
  const sev = (s?: string) => {
    const u = norm(s)
    return u === 'HIGH' ? 'text-red-700 bg-red-50 border-red-200'
      : u === 'MEDIUM' ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
      : 'text-green-700 bg-green-50 border-green-200'
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gov-ink">Alert Centre</h1>
        <p className="text-xs text-gov-muted">Automated detections requiring analyst review</p>
        {iid && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
              tab === t.id ? 'bg-gov-navy border-gov-navy text-white' : 'border-transparent text-gov-muted hover:text-gov-ink'
            }`}
          >
            <t.icon size={14} className={tab === t.id ? 'text-white' : t.color} />
            {t.label}
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
              tab === t.id ? 'bg-white/20 text-white' : 'bg-gov-wash text-gov-muted'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {tab === 'anomaly' && anomalies.map((a, i) => (
          <div key={i} className={`gov-card p-4 rounded-xl border ${sev(a.severity)}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${sev(a.severity)}`}>{norm(a.severity)}</span>
                  <span className="text-sm font-semibold text-gov-ink">{a.anomaly_type}</span>
                </div>
                <p className="text-xs text-gov-muted">{(a as any).explanation || a.description}</p>
                {a.entity_name && <p className="text-xs text-gov-navy mt-1 font-mono">Entity: {a.entity_name}</p>}
              </div>
              {a.score != null && (
                <span className="text-2xl font-mono font-bold text-gov-ink">
                  {typeof a.score === 'number' ? a.score.toFixed(1) : a.score}
                </span>
              )}
            </div>
          </div>
        ))}

        {tab === 'bridge' && bridges.map((b, i) => (
          <div key={i} className="gov-card p-4 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gov-ink">{b.name || b.id}</p>
                <p className="text-xs text-gov-muted mt-0.5">
                  Connects {b.cells?.join(', ') || 'multiple cells'} · Rank #{b.rank}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-bold text-purple-700">{(b.bridge_score || b.betweenness || 0).toFixed(4)}</p>
                <p className="text-[10px] text-gov-faint">bridge score</p>
              </div>
            </div>
          </div>
        ))}

        {tab === 'burst' && bursts.map((b, i) => (
          <div key={i} className="gov-card p-4 border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gov-ink">Cell: {b.cell}</p>
                <p className="text-xs text-gov-muted">Day {b.day} · {fmtWindow(b.window)}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-bold text-yellow-700">{b.zscore?.toFixed(2)}σ</p>
                <p className="text-[10px] text-gov-faint">{b.count} calls</p>
              </div>
            </div>
          </div>
        ))}

        {tab === 'cross' && crossCase.map((c: any, i) => (
          <div key={i} className="gov-card p-4 border-cyan-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gov-ink font-mono">{c.shared_entity}</p>
                <p className="text-xs text-gov-muted mt-0.5">
                  Shared across {(c.cases || []).length} case{(c.cases || []).length === 1 ? '' : 's'}
                  {(c.cases || []).length > 0 ? `: ${(c.cases || []).join(', ')}` : ''}
                </p>
                {c.relationship_path && (
                  <p className="text-xs text-cyan-700 mt-1">{c.relationship_path}</p>
                )}
              </div>
              {c.confidence != null && (
                <span className="text-lg font-mono font-bold text-cyan-700 flex-shrink-0">
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
          <div className="text-center py-12 text-gov-muted">
            <Bell size={32} className="mx-auto mb-2 text-gov-faint" />
            <p>No alerts in this category</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
