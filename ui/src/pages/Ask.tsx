import { useState } from 'react'
import {
  MessageSquareText, Check, AlertTriangle, Code2, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react'
import { fetchAsk } from '../api/client'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import { useLang } from '../i18n/LanguageContext'

// The point of this screen is not that it answers questions — it is that it
// says which parts of the question it could not apply. A narrow answer and a
// wrong answer look identical unless the system shows its reading of the query.

interface Ignored { phrase: string; reason: string }

interface AskResult {
  query: string
  answer: string
  understood: string[]
  ignored: Ignored[]
  relation: string | null
  subjects: string[]
  results: Array<{
    src: string; src_label: string; dst: string; dst_label: string
    kind: string; day: number | null; amount: number | null
    source: string; source_type: string; confidence: number
    supporting_text: string; evidence_hash: string
  }>
  result_count: number
  cypher: string
  cypher_params: Record<string, unknown>
  cypher_note: string
  disclaimer: string
}

const EXAMPLES_EN = [
  'Show me all associates of A1 who made transactions over 5 lakh in North Delhi during July',
  'who did Anwar Sheikh call between day 55 and 62',
  'transactions over 2 lakh',
  'payments under 50000 by C12',
  'calls at Dockside Ward',
]

// The parser resolves Devanagari names through the same path as Latin ones, so
// an officer can type the question in Hindi. Leading with that in Hindi mode.
const EXAMPLES_HI = [
  'रमेश यादव के कॉल रिकॉर्ड',
  'सुरेश राणे',
  'transactions over 2 lakh',
  'who did Anwar Sheikh call between day 55 and 62',
]

const inr = (n: number | null) =>
  n == null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export default function Ask() {
  const { iid, caseName, clear } = useCaseScope()
  const { t, lang } = useLang()
  const [q, setQ] = useState('')
  const [data, setData] = useState<AskResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCypher, setShowCypher] = useState(false)

  const run = async (text?: string) => {
    const query = (text ?? q).trim()
    if (!query) return
    setQ(query); setLoading(true); setError(''); setData(null)
    try {
      const { data } = await fetchAsk(query, iid || undefined)
      setData(data)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Query failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gov-ink">{t('ask.title')}</h1>
          <p className="text-xs text-gov-muted mt-0.5">
            {t('ask.subtitle')}
          </p>
        </div>
        {iid && <CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} />}
      </div>

      {/* Query box */}
      <div className="gov-card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MessageSquareText
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gov-faint"
            />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()}
              placeholder={t('ask.placeholder')}
              className="gov-input w-full pl-9 text-sm py-2"
            />
          </div>
          <button onClick={() => run()} disabled={loading} className="gov-btn px-4 text-sm disabled:opacity-60">
            {loading ? <Loader2 size={14} className="animate-spin" /> : t('ask.button')}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(lang === 'hi' ? EXAMPLES_HI : EXAMPLES_EN).map(ex => (
            <button
              key={ex}
              onClick={() => run(ex)}
              className="text-[10px] px-2 py-1 rounded-full border border-gov-border bg-white
                         text-gov-muted hover:border-gov-navy hover:text-gov-navy transition-colors"
            >
              {ex.length > 58 ? `${ex.slice(0, 58)}…` : ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="gov-card p-4 border-red-200 bg-red-50">
          <p className="text-sm text-gov-red font-semibold">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* The finding, stated. A row count makes the officer do the reading. */}
          <div className="gov-card p-4 border-l-4 border-l-gov-navy">
            <p className="text-sm text-gov-ink leading-relaxed">{data.answer}</p>
          </div>

          {/* Understood / ignored — the honesty contract */}
          <div className="grid grid-cols-2 gap-4">
            <div className="gov-card p-4">
              <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2 mb-2">
                <Check size={14} className="text-gov-igreen" />
                {t('ask.applied')}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data.understood.map((u, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-full border
                                           border-green-200 bg-green-50 text-gov-igreen">
                    {u}
                  </span>
                ))}
              </div>
            </div>

            <div className={`gov-card p-4 ${data.ignored.length ? 'border-amber-300' : ''}`}>
              <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className={data.ignored.length ? 'text-amber-600' : 'text-gov-faint'} />
                {t('ask.not_applied')}
                {data.ignored.length > 0 && (
                  <span className="text-[10px] font-mono bg-amber-50 text-amber-700
                                   border border-amber-200 px-1.5 py-0.5 rounded-full">
                    {data.ignored.length}
                  </span>
                )}
              </h2>
              {data.ignored.length === 0 ? (
                <p className="text-xs text-gov-muted">
                  {t('ask.all_understood')}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.ignored.map((ig, i) => (
                    <li key={i} className="text-[11px] leading-snug">
                      <span className="font-semibold text-amber-700">“{ig.phrase}”</span>
                      <span className="text-gov-muted"> — {ig.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="gov-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gov-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-gov-ink">
                {data.result_count} {t('ask.records')}
              </h2>
              {data.relation && (
                <span className="text-[10px] font-mono text-gov-muted">{data.relation}</span>
              )}
            </div>

            {data.result_count === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-gov-ink font-semibold">{t('ask.no_match')}</p>
                <p className="text-xs text-gov-muted mt-1">
                  {data.ignored.length
                    ? t('ask.no_match_partial')
                    : t('ask.no_match_full')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gov-muted">
                    <tr className="text-left">
                      {[t('ask.col.from'), t('ask.col.to'), t('ask.col.type'), t('ask.col.day'), t('ask.col.amount'), t('ask.col.source'), t('ask.col.hash')].map(h => (
                        <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-gov-ink">
                    {data.results.map((r, i) => (
                      <tr key={i} className={i % 2 ? 'bg-gray-50/60' : ''}>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className="font-medium">{r.src_label}</span>{' '}
                          <span className="text-gov-faint font-mono">{r.src}</span>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className="font-medium">{r.dst_label}</span>{' '}
                          <span className="text-gov-faint font-mono">{r.dst}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[10px]">{r.kind}</td>
                        <td className="px-3 py-1.5">{r.day ?? '—'}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{inr(r.amount)}</td>
                        <td className="px-3 py-1.5 font-mono text-[10px]">{r.source}</td>
                        <td className="px-3 py-1.5 font-mono text-[10px] text-gov-faint">
                          {r.evidence_hash?.slice(0, 12) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Equivalent Cypher */}
          <div className="gov-card">
            <button
              onClick={() => setShowCypher(s => !s)}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-sm font-semibold text-gov-ink"
            >
              {showCypher ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Code2 size={14} className="text-gov-navy" />
              {t('ask.cypher')}
            </button>
            {showCypher && (
              <div className="px-4 pb-4 space-y-2">
                <pre className="text-[11px] font-mono bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
{data.cypher}
                </pre>
                <pre className="text-[10px] font-mono text-gov-muted overflow-x-auto">
params: {JSON.stringify(data.cypher_params)}
                </pre>
                <p className="text-[10px] text-gov-muted">{data.cypher_note}</p>
              </div>
            )}
          </div>

          <p className="text-[10px] text-gov-muted px-1">{data.disclaimer}</p>
        </>
      )}
    </div>
  )
}
