import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ArrowRight } from 'lucide-react'
import { fetchCaseEvidence } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import CaseTable, { type TableColumn } from '../components/CaseTable'

const TYPES = [
  { id: 'firs', label: 'FIRs' },
  { id: 'surveillance', label: 'Surveillance' },
  { id: 'intel', label: 'Intel' },
  { id: 'social', label: 'Social' },
  { id: 'files', label: 'Files' },
] as const

type EvType = (typeof TYPES)[number]['id']

const COLUMNS: Record<EvType, TableColumn[]> = {
  firs: [
    { key: 'fir_id', label: 'FIR ID', mono: true },
    { key: 'station', label: 'Station' },
    { key: 'location', label: 'Location' },
    { key: 'ipc_sections', label: 'Sections', mono: true },
    {
      key: 'narrative', label: 'Narrative',
      render: r => <span className="block max-w-md whitespace-normal">{String(r.narrative || '—')}</span>,
    },
    { key: 'day', label: 'Day', mono: true, render: r => `D${r.day ?? '—'}` },
  ],
  surveillance: [
    { key: 'report_id', label: 'Report', mono: true },
    { key: 'team', label: 'Team' },
    { key: 'location', label: 'Location' },
    {
      key: 'activity_notes', label: 'Notes',
      render: r => <span className="block max-w-md whitespace-normal">{String(r.activity_notes || '—')}</span>,
    },
    { key: 'day', label: 'Day', mono: true, render: r => `D${r.day ?? '—'}` },
  ],
  intel: [
    { key: 'report_id', label: 'Report', mono: true },
    {
      key: 'narrative', label: 'Narrative',
      render: r => <span className="block max-w-md whitespace-normal">{String(r.narrative || '—')}</span>,
    },
    { key: 'source_reliability', label: 'Reliability', mono: true },
  ],
  social: [
    { key: 'post_id', label: 'Post', mono: true },
    { key: 'handle', label: 'Handle', mono: true },
    {
      key: 'post_text', label: 'Text',
      render: r => <span className="block max-w-md whitespace-normal">{String(r.post_text || '—')}</span>,
    },
    { key: 'hashtags', label: 'Tags', mono: true },
  ],
  files: [
    { key: 'original', label: 'File', mono: true },
    { key: 'detected_type', label: 'Detected as', mono: true },
    { key: 'format', label: 'Format', mono: true },
    {
      key: 'type_confidence', label: 'Confidence', align: 'right', mono: true,
      render: r => (r.type_confidence != null ? `${Math.round(r.type_confidence * 100)}%` : '—'),
    },
  ],
}

export default function Evidence({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { iid, caseName, scopeKey, clear } = useCaseScope()
  const [type, setType] = useState<EvType>('firs')
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!iid) return
    fetchCaseEvidence(iid, { type: 'firs', limit: 1 })
      .then(r => setCounts(r.data.counts || {}))
      .catch(() => setCounts({}))
  }, [iid, scopeKey])

  if (!iid) {
    return (
      <div className="space-y-5 max-w-3xl">
        {!embedded && (
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <FileText size={20} className="text-amber-700" /> Evidence
        </h1>
        )}
        <div className="gov-card p-8 text-center">
          <p className="text-sm text-gov-ink font-medium">No case open</p>
          <p className="text-xs text-gov-muted mt-1 mb-4">Open a case to browse everything found in it so far.</p>
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
          <FileText size={20} className="text-amber-700" /> Evidence
        </h1>
        )}
        {!embedded && <p className="text-xs text-gov-muted mt-0.5">Everything found in this case so far — reports, posts and source files.</p>
        }
        {!embedded && <div className="mt-2"><CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} /></div>
        }
      </div>

      <div className="flex gap-2 flex-wrap">
        {TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
              type === t.id
                ? 'bg-gov-navy border-gov-navy text-white'
                : 'bg-white border-gov-border text-gov-muted hover:text-gov-ink'
            }`}
          >
            {t.label}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              type === t.id ? 'bg-white/20' : 'bg-gov-wash text-gov-muted'
            }`}>
              {(counts[t.id] ?? 0).toLocaleString('en-IN')}
            </span>
          </button>
        ))}
      </div>

      <CaseTable
        key={type}
        scopeKey={`${scopeKey}:${type}`}
        searchPlaceholder={`Search ${type}… (Enter)`}
        emptyText={`No ${type} records match.`}
        fetchPage={async (page, qq) => {
          const { data } = await fetchCaseEvidence(iid, { type, page, limit: 50, q: qq || undefined })
          if (data.counts) setCounts(data.counts)
          return { rows: data.rows, total: data.total }
        }}
        columns={COLUMNS[type]}
      />
    </div>
  )
}
