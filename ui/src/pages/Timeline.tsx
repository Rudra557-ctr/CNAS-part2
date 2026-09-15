import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPlayback } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import {
  Clock, Play, Pause, RotateCcw, CalendarDays, AlertTriangle,
  TrendingUp, Moon, Flag, ChevronRight, Users,
} from 'lucide-react'

interface DayData {
  day: number; calls: number; minutes: number; transactions: number
  txn_amount: number; firs: any[]; fir_count: number; reports: number
  top_entities: { id: string; name: string; events: number }[]
  top_pairs: { a: string; a_name: string; b: string; b_name: string; n: number }[]
}
interface KeyDate {
  day: number; kind: string; title: string; reason: string
  evidence: { names: string[]; refs: string[] }
}
interface Period {
  span: [number, number]; kind: string; title: string; reason: string
  key_names: string[]; evidence: string[]
}
interface FlaggedDay { day: number; issues: string[]; insights: string[] }

const SPEEDS = [
  { label: '1×', ms: 1200 },
  { label: '2×', ms: 600 },
  { label: '4×', ms: 300 },
]

const KIND_STYLE: Record<string, string> = {
  burst: 'bg-red-50 border-red-200 text-gov-red',
  peak: 'bg-amber-50 border-amber-200 text-amber-700',
  money: 'bg-green-50 border-green-200 text-gov-igreen',
  coordination: 'bg-blue-50 border-blue-200 text-gov-navy',
  surge: 'bg-orange-50 border-orange-200 text-orange-700',
  lull: 'bg-slate-100 border-slate-300 text-slate-600',
}

function narrative(d: DayData): string {
  const bits: string[] = []
  if (d.calls) bits.push(`${d.calls} call${d.calls === 1 ? '' : 's'}`)
  if (d.transactions) bits.push(`${d.transactions} transfer${d.transactions === 1 ? '' : 's'} (Rs.${d.txn_amount.toLocaleString('en-IN')})`)
  if (d.fir_count) {
    const f = d.firs[0]
    bits.push(`FIR ${f.fir_id || ''} filed${f.station ? ` at ${f.station}` : ''}`)
  }
  if (d.reports) bits.push(`${d.reports} field report${d.reports === 1 ? '' : 's'}`)
  if (!bits.length) return 'A quiet day — no recorded calls, transfers, FIRs or reports.'
  const who = d.top_entities[0]
  return `Day ${d.day}: ${bits.join(', ')}.` + (who ? ` Most active: ${who.name} (${who.events} events).` : '')
}

export default function Timeline() {
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [days, setDays] = useState<DayData[]>([])
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [keyDates, setKeyDates] = useState<KeyDate[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [flagged, setFlagged] = useState<FlaggedDay[]>([])
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLoading(true); setPlaying(false); setDay(0)
    fetchPlayback(iid)
      .then(r => {
        const d = r.data
        setDays(d.days || [])
        setRange([d.day_start ?? 0, d.day_end ?? 0])
        setKeyDates(d.key_dates || [])
        setPeriods(d.unusual_periods || [])
        setFlagged(d.flagged_days || [])
        setDay(d.day_start ?? 0)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [scopeKey])

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    if (!playing || !days.length) return
    timer.current = setInterval(() => {
      setDay(prev => {
        if (prev >= range[1]) { setPlaying(false); return prev }
        return prev + 1
      })
    }, SPEEDS[speedIdx].ms)
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  }, [playing, speedIdx, days.length, range])

  const cur: DayData | undefined = useMemo(
    () => days.find(d => d.day === day), [days, day])

  const jump = (d: number) => { setPlaying(false); setDay(Math.min(Math.max(d, range[0]), range[1])) }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gov-navy border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <Clock size={20} className="text-gov-navy" />
          Case Timeline
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">
          Play the case day by day — every call, transfer, FIR and report as it happened.
        </p>
        {iid && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>}
      </div>

      {days.length === 0 ? (
        <div className="gov-card p-8 text-center">
          <p className="text-sm text-gov-ink font-medium">No dated events in this case</p>
          <p className="text-xs text-gov-muted mt-1">Upload CDRs, transactions or FIRs with day stamps to build a timeline.</p>
        </div>
      ) : (
        <>
          {/* ── Player ─────────────────────────────────────────── */}
          <div className="gov-card p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={() => {
                  if (day >= range[1]) setDay(range[0])
                  setPlaying(p => !p)
                }}
                className="gov-btn !px-5 !py-2.5 flex-shrink-0"
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {playing ? 'Pause' : day >= range[1] ? 'Replay' : 'Play narrative'}
              </button>
              <div className="flex-1 min-w-[200px]">
                <div className="flex justify-between text-[11px] font-mono text-gov-muted mb-1">
                  <span>Day {range[0]}</span>
                  <span className="text-sm font-bold text-gov-ink">Day {day}</span>
                  <span>Day {range[1]}</span>
                </div>
                <input
                  type="range" min={range[0]} max={range[1]} value={day}
                  onChange={e => jump(Number(e.target.value))}
                  className="w-full accent-[#1B3A6B]"
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {SPEEDS.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => setSpeedIdx(i)}
                    className={`text-[11px] font-mono px-2 py-1 rounded border ${
                      speedIdx === i
                        ? 'bg-gov-navy text-white border-gov-navy'
                        : 'border-gov-border text-gov-muted hover:text-gov-ink'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
                <button onClick={() => jump(range[0])} title="Back to start"
                  className="text-gov-muted hover:text-gov-ink p-1">
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            {cur && (
              <div className="mt-4 pt-4 border-t border-gov-border">
                <p className="text-sm text-gov-ink leading-relaxed">{narrative(cur)}</p>
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[
                    { v: cur.calls, l: 'Calls' },
                    { v: cur.transactions, l: 'Transfers' },
                    { v: cur.fir_count, l: 'FIRs' },
                    { v: cur.reports, l: 'Reports' },
                  ].map(s => (
                    <div key={s.l} className="bg-gov-wash rounded-lg px-3 py-2 text-center">
                      <p className="text-lg font-bold text-gov-ink font-mono">{s.v}</p>
                      <p className="text-[10px] text-gov-muted">{s.l}</p>
                    </div>
                  ))}
                </div>
                {cur.top_pairs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {cur.top_pairs.map((p, i) => (
                      <span key={i} className="gov-tag bg-gov-wash text-gov-navy border-gov-border">
                        {p.a_name} ↔ {p.b_name} ×{p.n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Key dates ──────────────────────────────────────── */}
          {keyDates.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gov-ink mb-2 flex items-center gap-2">
                <CalendarDays size={14} className="text-gov-navy" />
                Key dates — algorithm-picked turning points
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {keyDates.map(k => (
                  <button
                    key={`${k.day}-${k.kind}`}
                    onClick={() => jump(k.day)}
                    className="gov-card p-3.5 text-left hover:border-gov-navy transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${KIND_STYLE[k.kind] || KIND_STYLE.lull}`}>
                        DAY {k.day} · {k.kind.toUpperCase()}
                      </span>
                      <ChevronRight size={13} className="text-gov-faint flex-shrink-0" />
                    </div>
                    <p className="text-xs font-bold text-gov-ink">{k.title}</p>
                    <p className="text-[11px] text-gov-muted mt-1 leading-relaxed">{k.reason}</p>
                    {k.evidence.names.length > 0 && (
                      <p className="text-[10px] font-mono text-gov-faint mt-1.5 truncate">
                        Ev: {k.evidence.names.join(', ')}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Unusual periods (chronological) ────────────────── */}
          {periods.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gov-ink mb-2 flex items-center gap-2">
                {periods.some(p => p.kind === 'lull')
                  ? <Moon size={14} className="text-gov-navy" />
                  : <TrendingUp size={14} className="text-gov-navy" />}
                Unusual periods — chronological
              </h2>
              <div className="space-y-2.5">
                {periods.map((p, i) => (
                  <div key={i} className="gov-card p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold text-gov-ink">{p.title}</p>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${KIND_STYLE[p.kind] || KIND_STYLE.lull}`}>
                        DAYS {p.span[0]}–{p.span[1]}
                      </span>
                    </div>
                    <p className="text-[11px] text-gov-muted mt-1 leading-relaxed">{p.reason}</p>
                    {p.key_names.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold text-gov-muted mb-1 flex items-center gap-1">
                          <Users size={10} /> Key names in this window
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.key_names.map(n => (
                            <span key={n} className="gov-tag bg-gov-navy text-white border-gov-navy">{n}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] font-mono text-gov-faint">
                        Evidence: {p.evidence.join(' · ')}
                      </p>
                      <button onClick={() => jump(p.span[0])}
                        className="text-[11px] text-gov-navy hover:underline font-medium flex-shrink-0">
                        Jump to start →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Flagged days ───────────────────────────────────── */}
          {flagged.length > 0 && (
            <div className="gov-card p-4">
              <h2 className="text-sm font-bold text-gov-ink mb-3 flex items-center gap-2">
                <Flag size={14} className="text-gov-red" />
                Flagged days ({flagged.length})
              </h2>
              <div className="space-y-2">
                {flagged.map(f => (
                  <div key={f.day}
                    className={`rounded-lg border p-3 ${f.day === day ? 'border-gov-navy bg-blue-50/50' : 'border-gov-border'}`}>
                    <button onClick={() => jump(f.day)} className="flex items-center gap-2 w-full text-left">
                      <span className="text-xs font-mono font-bold text-gov-ink bg-gov-wash px-2 py-0.5 rounded">
                        Day {f.day}
                      </span>
                      <span className="text-[11px] text-gov-muted truncate flex-1">{f.issues[0]}</span>
                      {f.day === day && (
                        <span className="text-[10px] font-bold text-gov-navy flex-shrink-0">▶ NOW</span>
                      )}
                    </button>
                    <ul className="mt-1.5 space-y-1">
                      {f.issues.slice(1).map((iss, i) => (
                        <li key={i} className="text-[11px] text-gov-ink flex gap-1.5">
                          <AlertTriangle size={11} className="text-gov-red flex-shrink-0 mt-0.5" />
                          {iss}
                        </li>
                      ))}
                      {f.insights.map((ins, i) => (
                        <li key={`in-${i}`} className="text-[11px] text-gov-muted flex gap-1.5">
                          <span className="text-gov-navy font-bold flex-shrink-0">›</span>
                          <span><b>Insight:</b> {ins}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
