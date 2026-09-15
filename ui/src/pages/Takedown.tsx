import { useEffect, useState } from 'react'
import { fetchTakedownStrategies, simulateTakedown, searchPeople } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import type { TakedownStrategy, TakedownResult } from '../types'
import { Crosshair, Play, Plus, X } from 'lucide-react'

interface Suspect {
  id: string
  name: string
  role?: string
  cell?: string
}

const MAX_TARGETS = 12

function formalName(name: string): string {
  return name.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\s]+/u, '').trim()
}

function inr(n: number): string {
  if (!Number.isFinite(n)) return '₹0'
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export default function Takedown() {
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [strategies, setStrategies] = useState<TakedownStrategy[]>([])
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [targets, setTargets] = useState<Suspect[]>([])
  const [freeze, setFreeze] = useState(true)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Suspect[]>([])
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<TakedownResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setStrategies([]); setActivePreset(null); setTargets([])
    setResult(null); setError(''); setHits([]); setQuery('')
    fetchTakedownStrategies(iid)
      .then(r => setStrategies(r.data.strategies || []))
      .catch(() => setError('Could not load arrest scenarios from the backend.'))
  }, [scopeKey])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      searchPeople(q, iid)
        .then(r => setHits((r.data.results || []).slice(0, 8)))
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query, iid, scopeKey])

  const applyPreset = (s: TakedownStrategy) => {
    setActivePreset(s.id)
    setResult(null); setError('')
    setTargets((s.target_ids || []).slice(0, MAX_TARGETS).map(id => ({ id, name: id })))
  }

  const addSuspect = (s: Suspect) => {
    setActivePreset(null)
    setResult(null)
    setTargets(prev => {
      if (prev.some(t => t.id === s.id) || prev.length >= MAX_TARGETS) return prev
      return [...prev, s]
    })
    setQuery(''); setHits([])
  }

  const removeTarget = (id: string) => {
    setActivePreset(null)
    setResult(null)
    setTargets(prev => prev.filter(t => t.id !== id))
  }

  const simulate = async () => {
    if (targets.length === 0 || running) return
    setRunning(true); setResult(null); setError('')
    try {
      const { data } = await simulateTakedown(targets.map(t => t.id), freeze, iid)
      setResult(data)
    } catch {
      setError('Simulation failed. Check the backend connection and try again.')
    } finally {
      setRunning(false)
    }
  }

  const lenses = result?.lenses
  const reso = result?.case_resolution

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <Crosshair size={20} className="text-gov-navy" />
          Arrest Impact Simulator
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">
          Select suspects for arrest. The simulator measures the outcome four ways and reports
          how much of the case is resolved and how much of the syndicate is dismantled.
        </p>
        {iid && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>}
      </div>

      <div className="grid grid-cols-5 gap-4 items-start">
        {/* ── Left: scenario builder ─────────────────────────── */}
        <div className="col-span-2 gov-card p-4 space-y-4">
          <section>
            <h2 className="text-sm font-bold text-gov-ink mb-2">1 · Start from a preset package</h2>
            <div className="space-y-2">
              {strategies.map(s => (
                <button
                  key={s.id}
                  onClick={() => applyPreset(s)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    activePreset === s.id
                      ? 'border-gov-navy bg-gov-wash'
                      : 'border-gov-border bg-white hover:border-gov-navy'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-gov-ink">{formalName(s.name)}</span>
                    <span className="text-xs font-mono text-gov-muted flex-shrink-0">
                      {s.metrics?.dismantlement_score_pct != null
                        ? `${s.metrics.dismantlement_score_pct}%`
                        : '—'}
                    </span>
                  </span>
                  <span className="block text-xs text-gov-muted mt-0.5">{s.description}</span>
                  <span className="block text-[11px] text-gov-faint mt-1 font-mono">
                    {(s.target_ids || []).length} targets
                  </span>
                </button>
              ))}
              {strategies.length === 0 && !error && (
                <p className="text-xs text-gov-muted text-center py-4">Loading scenarios…</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gov-ink mb-2">2 · Adjust the arrest list</h2>
            <div className="relative">
              <input
                className="gov-input"
                placeholder="Type a name, ID or phone to add…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {(hits.length > 0 || searching) && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gov-border rounded-lg shadow-gov z-30 max-h-56 overflow-y-auto">
                  {searching && hits.length === 0
                    ? <p className="px-4 py-3 text-xs text-gov-muted">Searching…</p>
                    : hits.map(h => (
                      <button
                        key={h.id}
                        onClick={() => addSuspect(h)}
                        className="w-full text-left px-4 py-2 hover:bg-gov-wash flex items-center gap-2"
                      >
                        <Plus size={12} className="text-gov-navy flex-shrink-0" />
                        <span>
                          <span className="block text-sm text-gov-ink font-medium">{h.name || h.id}</span>
                          <span className="block text-[11px] text-gov-muted font-mono">
                            {h.id}{h.role ? ` · ${h.role}` : ''}{h.cell ? ` · Cell ${h.cell}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            {targets.length > 0 ? (
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="border-b border-gov-border text-left text-gov-muted">
                    <th className="font-semibold py-1.5 pr-2">Target</th>
                    <th className="font-semibold py-1.5 pr-2">Role</th>
                    <th className="py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => (
                    <tr key={t.id} className="border-b border-gov-border last:border-0">
                      <td className="py-1.5 pr-2">
                        <span className="block font-medium text-gov-ink">{t.name}</span>
                        <span className="block font-mono text-[10px] text-gov-faint">{t.id}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-gov-muted">{t.role || '—'}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => removeTarget(t.id)}
                          className="text-gov-faint hover:text-gov-red" title="Remove">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gov-faint mt-2">No targets yet — pick a package or add suspects above (max {MAX_TARGETS}).</p>
            )}
            {targets.length >= MAX_TARGETS && (
              <p className="text-[11px] text-gov-muted mt-1">Target list is full ({MAX_TARGETS}). Remove one to add another.</p>
            )}
          </section>

          <section className="flex items-center gap-2">
            <input
              id="freeze-accts"
              type="checkbox"
              checked={freeze}
              onChange={e => setFreeze(e.target.checked)}
              className="w-4 h-4 accent-[#1B3A6B]"
            />
            <label htmlFor="freeze-accts" className="text-xs text-gov-ink">
              Also freeze linked bank accounts and seize phones
            </label>
          </section>

          <button
            onClick={simulate}
            disabled={targets.length === 0 || running}
            className="gov-btn w-full justify-center disabled:opacity-50"
          >
            {running ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Simulating…
              </>
            ) : (
              <>
                <Play size={14} />
                Run simulation{activePreset ? '' : ` (${targets.length} custom targets)`}
              </>
            )}
          </button>
          {error && <p className="text-xs text-gov-red bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* ── Right: verdict ─────────────────────────────────── */}
        <div className="col-span-3 gov-card p-5">
          {!result ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-14">
              <Crosshair size={32} className="text-gov-borderd" />
              <p className="text-sm font-medium text-gov-ink">No simulation yet</p>
              <p className="text-xs text-gov-muted max-w-sm">
                Build an arrest list on the left and run it. You will get two verdicts —
                case resolved and syndicate dismantled — each broken down by how it was measured.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="gov-well p-4 text-center">
                  <p className="text-4xl font-bold text-gov-navy font-mono">
                    {reso?.overall_pct ?? 0}%
                  </p>
                  <p className="text-xs font-bold text-gov-ink mt-1">Case resolved</p>
                  <p className="text-[11px] text-gov-muted mt-0.5">
                    {reso?.suspects_neutralized ?? 0} of {reso?.suspects_total ?? 0} suspects ·
                    {' '}{reso?.firs_linked ?? 0} of {reso?.firs_total ?? 0} FIRs linked
                  </p>
                </div>
                <div className="gov-well p-4 text-center">
                  <p className="text-4xl font-bold text-gov-navy font-mono">
                    {result.dismantlement_score_pct ?? 0}%
                  </p>
                  <p className="text-xs font-bold text-gov-ink mt-1">Syndicate dismantled</p>
                  <p className="text-[11px] text-gov-muted mt-0.5">
                    {result.targets_count} arrested · {result.isolated_fragments_count} fragments remain
                  </p>
                </div>
              </div>

              <section>
                <h3 className="text-sm font-bold text-gov-ink mb-2">Assessment by lens</h3>
                <dl className="divide-y divide-gov-border border border-gov-border rounded-lg overflow-hidden">
                  {lenses && ([
                    {
                      k: 'fragmentation' as const,
                      headline: `${lenses.fragmentation?.components_before ?? '—'} → ${lenses.fragmentation?.components_after ?? '—'} fragments (${lenses.fragmentation?.new_fragments ?? 0} new)`,
                    },
                    {
                      k: 'communication' as const,
                      headline: `${lenses.communication?.called_severed ?? 0} of ${lenses.communication?.called_total ?? 0} call links severed (${lenses.communication?.called_share_pct ?? 0}%)`,
                    },
                    {
                      k: 'financial' as const,
                      headline: `${inr(lenses.financial?.seized_inr ?? 0)} seized of ${inr(lenses.financial?.case_volume_inr ?? 0)} (${lenses.financial?.money_share_pct ?? 0}%) · ${lenses.financial?.frozen_transactions ?? 0} transfers frozen`,
                    },
                    {
                      k: 'leadership' as const,
                      headline: (() => {
                        const r = lenses.leadership?.roles_neutralized || {}
                        const parts = Object.entries(r).map(([role, n]) => `${n}× ${role}`)
                        return parts.length ? parts.join(', ') + ' neutralised' : 'No leadership roles neutralised'
                      })(),
                    },
                  ]).map(({ k, headline }) => (
                    <div key={k} className="px-4 py-3 bg-white">
                      <dt className="text-xs font-bold text-gov-ink">
                        {lenses[k]?.label} — <span className="font-medium">{headline}</span>
                      </dt>
                      <dd className="text-[11px] text-gov-muted mt-0.5">{lenses[k]?.method}</dd>
                      {k === 'leadership' && (lenses.leadership?.deputies_remaining_count ?? 0) > 0 && (
                        <dd className="text-[11px] text-gov-muted mt-0.5">
                          Still active: {(lenses.leadership?.deputies_remaining || []).join(', ')}
                          {` (${lenses.leadership?.deputies_remaining_count} deputies)`}
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gov-ink mb-2">
                  Arrested ({result.target_profiles?.length ?? result.targets_count})
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gov-border text-left text-gov-muted">
                      <th className="font-semibold py-1.5 pr-2">Name</th>
                      <th className="font-semibold py-1.5 pr-2">Role</th>
                      <th className="font-semibold py-1.5 pr-2">Cell</th>
                      <th className="font-semibold py-1.5">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.target_profiles || []).map((t, i) => (
                      <tr key={i} className="border-b border-gov-border last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-gov-ink">
                          {(t.name as string) || (t.target_id as string)}
                        </td>
                        <td className="py-1.5 pr-2 text-gov-muted">{(t.role as string) || '—'}</td>
                        <td className="py-1.5 pr-2 text-gov-muted font-mono">{(t.cell as string) || '—'}</td>
                        <td className="py-1.5 text-gov-muted">{(t.risk_level as string) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {result.tactical_resource_allocation && (
                <p className="text-[11px] text-gov-muted">
                  Suggested deployment: {result.tactical_resource_allocation.armed_tactical_units} armed units ·{' '}
                  {result.tactical_resource_allocation.cyber_forensics_officers} cyber-forensics officers ·{' '}
                  {result.tactical_resource_allocation.perimeter_containment_squads} perimeter squads
                  ({result.tactical_resource_allocation.total_personnel_required} personnel).
                  {' '}{typeof result.succession_risk === 'string' ? result.succession_risk : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
