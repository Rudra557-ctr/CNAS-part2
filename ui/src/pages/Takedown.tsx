import { useEffect, useState } from 'react'
import { fetchTakedownStrategies, simulateTakedown } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import type { TakedownStrategy, TakedownResult } from '../types'
import { Crosshair, Zap, AlertTriangle, CheckCircle, Wallet } from 'lucide-react'

const BADGE_COLOR: Record<string, string> = {
  green:  'text-green-400 border-green-500/30 bg-green-500/10',
  blue:   'text-blue-400 border-blue-500/30 bg-blue-500/10',
  yellow: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  purple: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
}

export default function Takedown() {
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [strategies, setStrategies] = useState<TakedownStrategy[]>([])
  const [selected,   setSelected]   = useState<TakedownStrategy | null>(null)
  const [result,     setResult]     = useState<TakedownResult | null>(null)
  const [running,    setRunning]    = useState(false)
  const [loadError,  setLoadError]  = useState('')

  useEffect(() => {
    setStrategies([]); setSelected(null); setResult(null); setLoadError('')
    fetchTakedownStrategies(iid)
      .then(r => {
        const list = r.data.strategies || []
        setStrategies(list)
        if (list.length > 0) setSelected(list[0])
      })
      .catch(() => setLoadError('Could not load strike packages from the backend.'))
  }, [scopeKey])

  const simulate = async () => {
    if (!selected) return
    setRunning(true); setResult(null)
    try {
      const { data } = await simulateTakedown(selected.target_ids, true, iid)
      setResult(data)
    } catch (e) { console.error(e) }
    finally { setRunning(false) }
  }

  const impact = result?.dismantlement_score_pct ?? 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Crosshair size={20} className="text-red-400" />
          Takedown Simulator
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Simulate the network impact of arresting key individuals or dismantling cells.
          Used to optimise law enforcement intervention strategy.
        </p>
        {iid && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>}
      </div>

      <div className="grid grid-cols-2 gap-5">

        {/* Strategy selector */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Select Strike Package</h2>
          <div className="space-y-2">
            {strategies.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelected(s); setResult(null) }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selected?.id === s.id
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <p className="text-sm font-medium text-white">{s.name}</p>
                  <span className="text-xs font-mono text-red-400 flex-shrink-0">
                    {s.metrics?.dismantlement_score_pct != null
                      ? `${s.metrics.dismantlement_score_pct}% impact`
                      : ''}
                  </span>
                </div>
                {s.badge && (
                  <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border mb-1 ${BADGE_COLOR[s.badge_color || ''] || 'text-gray-400 border-dark-500'}`}>
                    {s.badge}
                  </span>
                )}
                <p className="text-xs text-gray-500">{s.description}</p>
                <p className="text-[10px] text-gray-600 mt-1 font-mono">
                  Targets: {(s.target_ids || []).slice(0, 3).join(', ')}
                  {(s.target_ids || []).length > 3 ? ` +${s.target_ids.length - 3} more` : ''}
                </p>
              </button>
            ))}
            {strategies.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">
                {loadError || 'Loading strategies from backend…'}
              </p>
            )}
          </div>

          <button
            onClick={simulate}
            disabled={!selected || running}
            className="btn-primary w-full justify-center disabled:opacity-50"
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Simulating…
              </>
            ) : (
              <>
                <Zap size={14} />
                Run Simulation
              </>
            )}
          </button>
        </div>

        {/* Result panel */}
        <div className="card p-5">
          {!result ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center gap-2 py-12">
              <Crosshair size={36} className="text-gray-700" />
              <p className="text-sm">Select a strategy and run simulation</p>
              <p className="text-xs">Results show network fragmentation after arrest</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Score */}
              <div className="text-center">
                <div className="text-5xl font-mono font-bold text-red-400 mb-1">
                  {impact}%
                </div>
                <p className="text-sm text-gray-400">Network Dismantlement</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {result.targets_count} targets neutralised
                </p>
              </div>

              {/* Efficiency before / after */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-xl p-3 bg-dark-700 border-yellow-500/30">
                  <p className="text-xs font-mono font-bold mb-2 text-yellow-400">Baseline efficiency</p>
                  <p className="text-xl font-mono text-white">{result.baseline_efficiency?.toFixed(4)}</p>
                </div>
                <div className="border rounded-xl p-3 bg-dark-700 border-green-500/30">
                  <p className="text-xs font-mono font-bold mb-2 text-green-400">Post-strike efficiency</p>
                  <p className="text-xl font-mono text-white">{result.post_takedown_efficiency?.toFixed(4)}</p>
                </div>
              </div>

              {/* Impact stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-dark-700 rounded-xl p-3">
                  <p className="text-lg font-mono font-bold text-white">{result.isolated_fragments_count}</p>
                  <p className="text-[10px] text-gray-500">isolated fragments</p>
                </div>
                <div className="bg-dark-700 rounded-xl p-3">
                  <p className="text-lg font-mono font-bold text-white">{result.severed_channels_count}</p>
                  <p className="text-[10px] text-gray-500">channels severed</p>
                </div>
                <div className="bg-dark-700 rounded-xl p-3">
                  <p className="text-lg font-mono font-bold text-white">
                    ₹{(result.recoverable_assets_inr / 100000).toFixed(1)}L
                  </p>
                  <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                    <Wallet size={10} /> assets freezable
                  </p>
                </div>
              </div>

              {/* Resource allocation */}
              {result.tactical_resource_allocation && (
                <div className="bg-dark-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={14} className="text-green-400" />
                    <p className="text-xs font-semibold text-white">Tactical Resource Allocation</p>
                  </div>
                  <div className="space-y-1 text-xs text-gray-300">
                    {Object.entries(result.tactical_resource_allocation).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Targets */}
              <div>
                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                  <AlertTriangle size={11} /> Neutralised targets
                </p>
                <div className="flex flex-wrap gap-1">
                  {(result.target_profiles || []).map((t, i) => (
                    <span key={i} className="badge-person">
                      {(t.name as string) || (t.id as string) || (t.target_id as string) || `Target ${i + 1}`}
                    </span>
                  ))}
                  {(!result.target_profiles || result.target_profiles.length === 0) && (
                    <span className="text-xs text-gray-500">{result.targets_count} targets</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
