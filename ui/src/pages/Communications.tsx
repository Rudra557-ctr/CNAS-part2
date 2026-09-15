import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, ArrowRight } from 'lucide-react'
import { fetchCaseCommunications } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import CaseTable from '../components/CaseTable'

const fmtDur = (s: unknown) => {
  const n = Math.round(Number(s) || 0)
  if (n < 60) return `${n}s`
  const m = Math.floor(n / 60)
  return m < 60 ? `${m}m ${n % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const party = (name: unknown, id: unknown, phone: unknown) => (
  <span>
    <span className="block font-medium">{String(name || id || '—')}</span>
    <span className="block font-mono text-[10px] text-gov-muted">
      {[id, phone].filter(Boolean).join(' · ')}
    </span>
  </span>
)

const fmtDurTotal = (s: number) => {
  const h = Math.floor(s / 3600)
  return h > 0 ? `${h}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)}m`;
}

export default function Communications({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [summary, setSummary] = useState<{ count: number; total_duration_sec: number } | null>(null)

  useEffect(() => {
    if (!iid) { setSummary(null); return }
    fetchCaseCommunications(iid, { limit: 1 })
      .then(r => setSummary(r.data.summary || null))
      .catch(() => setSummary(null))
  }, [iid, scopeKey])

  if (!iid) {
    return (
      <div className="space-y-5 max-w-3xl">
        {!embedded && (
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <Phone size={20} className="text-blue-700" /> Communications
        </h1>
        )}
        <div className="gov-card p-8 text-center">
          <p className="text-sm text-gov-ink font-medium">No case open</p>
          <p className="text-xs text-gov-muted mt-1 mb-4">Open a case to see every recorded call in it.</p>
          <button onClick={() => navigate('/cases')} className="gov-btn mx-auto">Go to Cases <ArrowRight size={13} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        {!embedded && (
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <Phone size={20} className="text-blue-700" /> Communications
        </h1>
        )}
        {!embedded && <p className="text-xs text-gov-muted mt-0.5">Every call record (CDR) captured in this case.</p>
        }
        {!embedded && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>
        }
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="gov-stat">
          <span className="text-xs font-medium text-gov-muted">Call records</span>
          <p className="text-[26px] font-bold text-gov-ink leading-tight">
            {(summary?.count ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="gov-stat">
          <span className="text-xs font-medium text-gov-muted">Total talk time</span>
          <p className="text-[26px] font-bold text-gov-ink leading-tight">{fmtDurTotal(summary?.total_duration_sec ?? 0)}</p>
        </div>
      </div>

      <CaseTable
        scopeKey={scopeKey}
        searchPlaceholder="Search id, name, phone, tower, type… (Enter)"
        emptyText="No call records match."
        fetchPage={async (page, qq) => {
          const { data } = await fetchCaseCommunications(iid, { page, limit: 50, q: qq || undefined })
          return { rows: data.rows, total: data.total }
        }}
        columns={[
          { key: 'call_id', label: 'Call ID', mono: true },
          { key: 'caller', label: 'Caller', render: r => party(r.caller_name, r.caller_id, r.caller_phone) },
          { key: 'callee', label: 'Callee', render: r => party(r.callee_name, r.callee_id, r.callee_phone) },
          { key: 'duration_sec', label: 'Duration', align: 'right', mono: true, render: r => fmtDur(r.duration_sec) },
          { key: 'cell_tower_location', label: 'Tower' },
          { key: 'day', label: 'Day', mono: true, render: r => `D${r.day ?? '—'}` },
        ]}
      />
    </div>
  )
}
