import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, ArrowRight } from 'lucide-react'
import { fetchCaseTransactions } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import CaseTable from '../components/CaseTable'

const inr = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : '—'
}

const party = (name: unknown, id: unknown, acct: unknown) => (
  <span>
    <span className="block font-medium">{String(name || id || '—')}</span>
    <span className="block font-mono text-[10px] text-gov-muted">
      {[id, acct].filter(Boolean).join(' · ')}
    </span>
  </span>
)

export default function Finance({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [summary, setSummary] = useState<{ count: number; total_amount_inr: number } | null>(null)

  useEffect(() => {
    if (!iid) { setSummary(null); return }
    fetchCaseTransactions(iid, { limit: 1 })
      .then(r => setSummary(r.data.summary || null))
      .catch(() => setSummary(null))
  }, [iid, scopeKey])

  if (!iid) {
    return (
      <div className="space-y-5 max-w-3xl">
        {!embedded && (
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <Wallet size={20} className="text-gov-igreen" /> Finance
        </h1>
        )}
        <div className="gov-card p-8 text-center">
          <p className="text-sm text-gov-ink font-medium">No case open</p>
          <p className="text-xs text-gov-muted mt-1 mb-4">Open a case to see every financial transaction recorded in it.</p>
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
          <Wallet size={20} className="text-gov-igreen" /> Finance
        </h1>
        )}
        {!embedded && <p className="text-xs text-gov-muted mt-0.5">Every financial transaction recorded in this case.</p>
        }
        {!embedded && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>
        }
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="gov-stat">
          <span className="text-xs font-medium text-gov-muted">Transactions</span>
          <p className="text-[26px] font-bold text-gov-ink leading-tight">
            {(summary?.count ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
        <div className="gov-stat">
          <span className="text-xs font-medium text-gov-muted">Total value moved</span>
          <p className="text-[26px] font-bold text-gov-ink leading-tight">{inr(summary?.total_amount_inr)}</p>
        </div>
      </div>

      <CaseTable
        scopeKey={scopeKey}
        searchPlaceholder="Search id, name, account, type… (Enter)"
        emptyText="No transactions match."
        fetchPage={async (page, qq) => {
          const { data } = await fetchCaseTransactions(iid, { page, limit: 50, q: qq || undefined })
          return { rows: data.rows, total: data.total }
        }}
        columns={[
          { key: 'txn_id', label: 'Txn ID', mono: true },
          { key: 'sender', label: 'Sender', render: r => party(r.sender_name, r.sender_id, r.sender_account) },
          { key: 'receiver', label: 'Receiver', render: r => party(r.receiver_name, r.receiver_id, r.receiver_account) },
          { key: 'amount_inr', label: 'Amount', align: 'right', mono: true, render: r => <b>{inr(r.amount_inr)}</b> },
          { key: 'txn_type', label: 'Type' },
          { key: 'day', label: 'Day', mono: true, render: r => `D${r.day ?? '—'}` },
        ]}
      />
    </div>
  )
}
