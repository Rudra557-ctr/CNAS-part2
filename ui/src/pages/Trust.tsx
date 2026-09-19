import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Award, SearchCheck, Link2, Copy, Check, Users } from 'lucide-react'
import { fetchLedger, fetchCertificate, verifyEvidenceHash, fetchResolution } from '../api/client'

interface ResolutionRow {
  mention: string
  romanised: string | null
  master_id: string
  master_label: string
  rejected: boolean
  confidence: string
  name_score: string
  method_family: string
  script: 'devanagari' | 'latin'
  source_id: string
  source_type: string
}

interface ResolutionPayload {
  rows: ResolutionRow[]
  summary: { total: number; merged: number; rejected: number; cross_script: number }
}

const METHOD_LABEL: Record<string, string> = {
  fuzzy_translit: 'transliteration',
  fuzzy_initials: 'initials',
  fuzzy_partial: 'partial name',
  fuzzy_reject: 'below threshold',
  exact_name: 'exact',
  fuzzy: 'fuzzy name',
}

function Hash({ v }: { v?: string }) {
  const [copied, setCopied] = useState(false)
  if (!v) return <span className="text-gov-faint">—</span>
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-gov-ink">
      {v.slice(0, 12)}…{v.slice(-6)}
      <button
        onClick={() => { navigator.clipboard?.writeText(v).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="text-gov-faint hover:text-gov-navy" title="Copy full hash"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </span>
  )
}

export default function Trust() {
  const [caseId] = useState<string | null>(() => sessionStorage.getItem('caseId'))
  const [caseName] = useState<string>(() => sessionStorage.getItem('caseName') || '')
  const [ledger, setLedger] = useState<any | null>(null)
  const [cert, setCert] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<any | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyErr, setVerifyErr] = useState('')
  const [res, setRes] = useState<ResolutionPayload | null>(null)
  const [crossOnly, setCrossOnly] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchLedger(caseId || undefined).then(r => r.data).catch(() => null),
      fetchCertificate(caseId || undefined).then(r => r.data).catch(() => null),
      fetchResolution(caseId || undefined).then(r => r.data).catch(() => null),
    ]).then(([l, c, m]) => { setLedger(l); setCert(c); setRes(m) })
      .finally(() => setLoading(false))
  }, [caseId])

  const resRows = useMemo(
    () => (res?.rows || []).filter(r => !crossOnly || r.script === 'devanagari'),
    [res, crossOnly],
  )

  const verify = async () => {
    if (!query.trim()) return
    setVerifying(true); setVerifyErr(''); setResult(null)
    try {
      const { data } = await verifyEvidenceHash(query.trim(), caseId || undefined)
      setResult(data)
    } catch (e: any) {
      setVerifyErr(e.response?.data?.detail || 'Verification failed.')
    } finally { setVerifying(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gov-navy border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const blocks: any[] = ledger?.blocks || []

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <ShieldCheck size={20} className="text-gov-igreen" />
          Evidence Trust
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">
          Cryptographic ledger, chain-of-custody certificate and hash verifier
          {caseId ? <> for case <b className="font-mono">{caseName || caseId}</b></> : ' for the master network case'}.
        </p>
      </div>

      {/* Integrity header */}
      <div className="gov-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold text-gov-muted uppercase tracking-wide">Chain integrity</p>
            <p className={`text-lg font-bold ${ledger?.chain_integrity_verified ? 'text-gov-igreen' : 'text-gov-red'}`}>
              {ledger?.chain_integrity_verified ? 'Verified — 0 tampering detected' : 'Unverified'}
            </p>
          </div>
          <div className="flex gap-5 text-center">
            {[
              { v: ledger?.total_blocks ?? '—', l: 'Blocks' },
              { v: ledger?.total_evidence_records ?? '—', l: 'Evidence records' },
              { v: ledger?.cryptographic_algorithm || 'SHA-256', l: 'Algorithm' },
            ].map(s => (
              <div key={s.l}>
                <p className="text-lg font-mono font-bold text-gov-ink">{s.v}</p>
                <p className="text-[10px] text-gov-faint">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="gov-well mt-4 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gov-muted">Master Merkle Root</span>
          <Hash v={ledger?.master_merkle_root} />
        </div>
        {ledger?.legal_framework && (
          <p className="text-[11px] text-gov-faint mt-2">{ledger.legal_framework}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        {/* BSA-63 certificate */}
        <div className="gov-card p-5">
          <h2 className="text-sm font-bold text-gov-ink mb-3 flex items-center gap-2">
            <Award size={14} className="text-amber-600" />
            Chain-of-Custody Certificate
          </h2>
          {!cert ? (
            <p className="text-xs text-gov-faint">Certificate unavailable for this scope.</p>
          ) : (
            <div className="space-y-2.5">
              <div>
                <p className="text-[11px] font-semibold text-gov-muted">Certificate ID</p>
                <p className="text-sm font-mono font-bold text-gov-navy">{cert.certificate_id}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[11px] font-semibold text-gov-muted">Certifying officer</p>
                  <p className="text-gov-ink">{cert.certifying_officer || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gov-muted">Issued</p>
                  <p className="text-gov-ink font-mono text-[11px]">{cert.timestamp || '—'}</p>
                </div>
              </div>
              <div className="gov-well p-3">
                <p className="text-[11px] text-gov-ink leading-relaxed">{cert.legal_declaration}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gov-muted">Verification token</span>
                <Hash v={cert.verification_token} />
              </div>
            </div>
          )}
        </div>

        {/* Hash verifier */}
        <div className="gov-card p-5">
          <h2 className="text-sm font-bold text-gov-ink mb-3 flex items-center gap-2">
            <SearchCheck size={14} className="text-gov-navy" />
            Verify Evidence Hash
          </h2>
          <p className="text-[11px] text-gov-muted mb-3">
            Paste a block hash, Merkle root, leaf hash or raw record text. Anything else returns a signed non-match.
          </p>
          <div className="flex gap-2">
            <input
              className="gov-input flex-1 font-mono !py-1.5 text-xs"
              placeholder="hash or record text…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') verify() }}
            />
            <button onClick={verify} disabled={verifying || !query.trim()}
              className="gov-btn !py-1.5 text-xs disabled:opacity-50 flex-shrink-0">
              {verifying ? 'Checking…' : 'Verify'}
            </button>
          </div>
          {verifyErr && <p className="text-[11px] text-gov-red mt-2">{verifyErr}</p>}
          {result && (
            <div className={`mt-3 rounded-lg border p-3 ${result.verified ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-xs font-bold ${result.verified ? 'text-gov-igreen' : 'text-gov-red'}`}>
                {result.verified ? 'MATCH VERIFIED' : 'NO MATCH'}
              </p>
              <p className="text-[11px] text-gov-ink mt-1">{result.message || result.match_type}</p>
              {result.computed_hash && (
                <p className="text-[10px] font-mono text-gov-faint mt-1 break-all">{result.computed_hash}</p>
              )}
            </div>
          )}
          {ledger?.master_merkle_root && !result && (
            <button
              onClick={() => { setQuery(ledger.master_merkle_root); }}
              className="text-[11px] text-gov-navy hover:underline mt-2"
            >
              Try it: fill in the master root above
            </button>
          )}
        </div>
      </div>

      {/* Identity matches — the resolver's working, shown rather than claimed */}
      <div className="gov-card p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">
            <Users size={14} className="text-gov-navy" />
            Identity Matches ({res?.summary.total ?? 0})
          </h2>
          {(res?.summary.cross_script ?? 0) > 0 && (
            <button
              onClick={() => setCrossOnly(v => !v)}
              className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                crossOnly
                  ? 'bg-gov-navy text-white border-gov-navy'
                  : 'border-gov-border text-gov-muted hover:border-gov-navy'}`}
            >
              Cross-script only ({res!.summary.cross_script})
            </button>
          )}
        </div>
        <p className="text-[11px] text-gov-muted mb-3">
          How each name found in a document was matched to a person on file — original text on
          the left, exactly as it was written.
          {(res?.summary.rejected ?? 0) > 0 && (
            <> {res!.summary.rejected} candidate{res!.summary.rejected === 1 ? ' was' : 's were'}{' '}
            deliberately <strong>not</strong> merged for scoring below the threshold.</>
          )}
        </p>

        {!resRows.length ? (
          <p className="text-[11px] text-gov-faint">
            No identity matches recorded for this scope.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gov-muted">
                <tr className="text-left">
                  {['Found in document', 'Script', '', 'Matched to', 'Score', 'Method', 'Source'].map((h, i) => (
                    <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-gov-ink">
                {resRows.map((r, i) => (
                  <tr
                    key={i}
                    className={`${i % 2 ? 'bg-gray-50/60' : ''} ${
                      r.script === 'devanagari' ? 'border-l-4 border-l-gov-saffron' : ''}`}
                  >
                    <td className="px-3 py-2">
                      <span className="text-sm font-medium">{r.mention}</span>
                      {r.romanised && (
                        <span className="block text-[10px] text-gov-faint font-mono">
                          reads as “{r.romanised}”
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        r.script === 'devanagari'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-gray-50 text-gov-muted border-gov-border'}`}>
                        {r.script === 'devanagari' ? 'Devanagari' : 'Latin'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {r.rejected
                        ? <span className="text-gov-red font-bold">✕</span>
                        : <span className="text-gov-igreen font-bold">→</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.rejected ? (
                        <span className="text-gov-muted">
                          {r.master_label} <span className="font-mono text-gov-faint">{r.master_id}</span>
                          <span className="block text-[10px] text-gov-red">not merged</span>
                        </span>
                      ) : (
                        <>
                          <span className="font-medium">{r.master_label}</span>{' '}
                          <span className="font-mono text-gov-faint">{r.master_id}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.name_score ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-mono text-gov-muted">
                        {METHOD_LABEL[r.method_family] || r.method_family}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gov-faint whitespace-nowrap">
                      {r.source_id}{r.source_type ? ` · ${r.source_type}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger blocks */}
      <div className="gov-card p-4">
        <h2 className="text-sm font-bold text-gov-ink mb-3 flex items-center gap-2">
          <Link2 size={14} className="text-gov-navy" />
          Ledger Blocks ({blocks.length})
        </h2>
        {blocks.length === 0 ? (
          <p className="text-xs text-gov-faint text-center py-6">No blocks in this scope.</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b: any) => (
              <div key={b.index} className="gov-well px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono font-bold text-gov-navy">#{b.index}</span>
                  <p className="text-xs text-gov-ink font-semibold">{b.block_name}</p>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-gov-border text-gov-muted uppercase">
                    {b.category}
                  </span>
                  <span className="text-[10px] font-mono text-gov-faint ml-auto">
                    {b.records_count} records
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gov-faint">block</span>
                    <Hash v={b.block_hash} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gov-faint">merkle</span>
                    <Hash v={b.merkle_root} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
