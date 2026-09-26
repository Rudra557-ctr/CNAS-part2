import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, Award, SearchCheck, Copy, Check, Users, ChevronDown,
  Phone, Banknote, FileText, Eye, Share2, Network, Fingerprint, ArrowRight,
} from 'lucide-react'
import { fetchLedger, fetchCertificate, verifyEvidenceHash, fetchResolution } from '../api/client'
import { useLang } from '../i18n/LanguageContext'

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

// One icon per evidence kind. A block of call records should be recognisable
// before its title is read.
const BLOCK_ICON: Record<string, any> = {
  SYSTEM: ShieldCheck, TELEPHONY: Phone, FINANCIAL: Banknote, LEGAL: FileText,
  SURVEILLANCE: Eye, OSINT: Share2, GRAPH: Network,
}

function CopyButton({ v, className = '' }: { v: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(v).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className={`text-gov-faint hover:text-gov-navy flex-shrink-0 ${className}`}
      title="Copy"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function Hash({ v }: { v?: string }) {
  if (!v) return <span className="text-gov-faint">—</span>
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-gov-ink">
      {v.slice(0, 10)}…{v.slice(-6)}
      <CopyButton v={v} />
    </span>
  )
}

export default function Trust() {
  const { t } = useLang()
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
  const [showHashes, setShowHashes] = useState(false)
  const [showDeclaration, setShowDeclaration] = useState(false)

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

  const runCheck = async (value?: string) => {
    const q = (value ?? query).trim()
    if (!q) return
    setQuery(q)
    setVerifying(true); setVerifyErr(''); setResult(null)
    try {
      const { data } = await verifyEvidenceHash(q, caseId || undefined)
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
  const sealed = !!ledger?.chain_integrity_verified
  const maxRecords = Math.max(1, ...blocks.map(b => b.records_count || 0))

  // Examples that actually resolve, so anyone can press one and see the check
  // work — a blank box invites pasting something that was never in this case.
  const samples = [
    ledger?.master_merkle_root && { label: t('trust.check.case'), value: ledger.master_merkle_root },
    blocks[1]?.block_hash && { label: t('trust.check.block'), value: blocks[1].block_hash },
    blocks[1]?.sample_leaf_hashes?.[0] && { label: t('trust.check.record'), value: blocks[1].sample_leaf_hashes[0] },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <ShieldCheck size={20} className="text-gov-igreen" />
          {t('trust.title')}
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">
          {caseId
            ? <>{t('trust.scope_case')} <b className="font-mono">{caseName || caseId}</b></>
            : t('trust.scope_master')}
          {ledger?.legal_framework ? ` · ${ledger.legal_framework}` : ''}
        </p>
      </div>

      {/* ── What this page proves ─────────────────────────────────────── */}
      <div className="gov-card p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            sealed ? 'bg-green-50' : 'bg-red-50'}`}>
            <ShieldCheck size={20} className={sealed ? 'text-gov-igreen' : 'text-gov-red'} />
          </div>
          <div className="min-w-0">
            <p className={`text-base font-bold ${sealed ? 'text-gov-igreen' : 'text-gov-red'}`}>
              {sealed ? t('trust.sealed') : t('trust.broken')}
            </p>
            <p className="text-xs text-gov-muted leading-relaxed mt-1 max-w-2xl">
              {t('trust.hero_help')}
            </p>
          </div>
        </div>

        {/* records → blocks → one number */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {[
            { v: (ledger?.total_evidence_records ?? 0).toLocaleString('en-IN'), l: t('trust.step.records') },
            { v: ledger?.total_blocks ?? '—', l: t('trust.step.blocks') },
            { v: '1', l: t('trust.step.root') },
          ].map((s, i, arr) => (
            <div key={s.l} className="flex items-center gap-2 flex-1 min-w-[9rem]">
              <div className="gov-well px-3 py-2 flex-1">
                <p className="text-lg font-mono font-bold text-gov-ink leading-tight">{s.v}</p>
                <p className="text-[10px] text-gov-muted leading-snug">{s.l}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight size={14} className="text-gov-faint flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* the number itself, in full */}
        <div className="mt-4 rounded-lg border border-gov-navy/20 bg-gov-navy/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Fingerprint size={13} className="text-gov-navy" />
            <span className="text-[11px] font-bold text-gov-ink">{t('trust.fingerprint')}</span>
            <span className="text-[10px] text-gov-faint">{t('trust.fingerprint_sub')}</span>
            {ledger?.master_merkle_root && <CopyButton v={ledger.master_merkle_root} className="ml-auto" />}
          </div>
          <p className="font-mono text-[11px] text-gov-ink break-all leading-relaxed">
            {ledger?.master_merkle_root || '—'}
          </p>
        </div>
      </div>

      {/* ── Check a record ────────────────────────────────────────────── */}
      <div className="gov-card p-5">
        <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">
          <SearchCheck size={14} className="text-gov-navy" />
          {t('trust.check.title')}
        </h2>
        <p className="text-[11px] text-gov-muted mt-1 mb-3">{t('trust.check.help')}</p>

        <div className="flex gap-2">
          <input
            className="gov-input flex-1 font-mono !py-2 text-xs"
            placeholder={t('trust.check.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runCheck() }}
          />
          <button onClick={() => runCheck()} disabled={verifying || !query.trim()}
            className="gov-btn !py-2 text-xs disabled:opacity-50 flex-shrink-0">
            {verifying ? t('trust.check.working') : t('trust.check.button')}
          </button>
        </div>

        {samples.length > 0 && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-[10px] text-gov-faint">{t('trust.check.try')}</span>
            {samples.map(s => (
              <button
                key={s.label}
                onClick={() => runCheck(s.value)}
                className="text-[10px] px-2 py-1 rounded-full border border-gov-border text-gov-muted hover:border-gov-navy hover:text-gov-navy transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {verifyErr && <p className="text-[11px] text-gov-red mt-2">{verifyErr}</p>}

        {result && (
          <div className={`mt-3 rounded-lg border p-3 flex items-start gap-2.5 ${
            result.verified ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              result.verified ? 'bg-gov-igreen' : 'bg-gov-red'}`}>
              {result.verified ? <Check size={14} className="text-white" /> : <span className="text-white text-xs font-bold">✕</span>}
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-bold ${result.verified ? 'text-gov-igreen' : 'text-gov-red'}`}>
                {result.verified ? t('trust.check.yes') : t('trust.check.no')}
              </p>
              {result.block_name && (
                <p className="text-[11px] text-gov-ink mt-0.5">
                  {result.block_name} · block #{result.block_index}
                </p>
              )}
              {result.computed_hash && (
                <p className="text-[10px] font-mono text-gov-faint mt-1 break-all">{result.computed_hash}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Identity matches — the resolver's working, shown not claimed ─ */}
      <div className="gov-card p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">
            <Users size={14} className="text-gov-navy" />
            {t('trust.identity')}
          </h2>
          {(res?.summary.cross_script ?? 0) > 0 && (
            <button
              onClick={() => setCrossOnly(v => !v)}
              className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                crossOnly
                  ? 'bg-gov-navy text-white border-gov-navy'
                  : 'border-gov-border text-gov-muted hover:border-gov-navy'}`}
            >
              {t('trust.cross_only')} ({res!.summary.cross_script})
            </button>
          )}
        </div>

        {res && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {[
              { v: res.summary.merged, l: t('trust.sum.merged'), c: 'text-gov-igreen' },
              { v: res.summary.rejected, l: t('trust.sum.refused'), c: 'text-gov-red' },
              { v: res.summary.cross_script, l: t('trust.sum.cross'), c: 'text-orange-600' },
            ].map(s => (
              <span key={s.l} className="gov-well px-2.5 py-1 text-[11px] text-gov-muted">
                <b className={`font-mono ${s.c}`}>{s.v}</b> {s.l}
              </span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gov-muted mt-2 mb-3">{t('trust.identity_help')}</p>

        {!resRows.length ? (
          <p className="text-[11px] text-gov-faint">{t('trust.no_matches')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gov-muted">
                <tr className="text-left">
                  {[t('trust.col.found'), t('trust.col.script'), '', t('trust.col.matched'), t('trust.col.score'), t('trust.col.method'), t('trust.col.source')].map((h, i) => (
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
                          {t('trust.reads_as')} “{r.romanised}”
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        r.script === 'devanagari'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-gray-50 text-gov-muted border-gov-border'}`}>
                        {r.script === 'devanagari' ? t('trust.script.devanagari') : t('trust.script.latin')}
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
                          <span className="block text-[10px] text-gov-red">{t('trust.not_merged')}</span>
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
                        {t(`trust.method.${r.method_family}`)}
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

      {/* ── What is sealed: the chain, as a chain ─────────────────────── */}
      <div className="gov-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">
              <Fingerprint size={14} className="text-gov-navy" />
              {t('trust.blocks.title')}
            </h2>
            <p className="text-[11px] text-gov-muted mt-1 max-w-2xl">{t('trust.blocks.help')}</p>
          </div>
          <button
            onClick={() => setShowHashes(v => !v)}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors flex-shrink-0 ${
              showHashes ? 'bg-gov-navy text-white border-gov-navy'
                         : 'border-gov-border text-gov-muted hover:border-gov-navy'}`}
          >
            {t('trust.blocks.show')}
          </button>
        </div>

        {blocks.length === 0 ? (
          <p className="text-xs text-gov-faint text-center py-6">No blocks in this scope.</p>
        ) : (
          <div className="mt-3">
            {blocks.map((b: any, i: number) => {
              const Icon = BLOCK_ICON[b.category] || FileText
              return (
                <div key={b.index} className="flex gap-3">
                  {/* chain rail */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-7 h-7 rounded-full bg-gov-wash border border-gov-border flex items-center justify-center">
                      <Icon size={13} className="text-gov-navy" />
                    </div>
                    {i < blocks.length - 1 && <div className="w-px flex-1 bg-gov-border my-1" />}
                  </div>

                  <div className="flex-1 min-w-0 pb-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-gov-faint">#{b.index}</span>
                      <p className="text-xs font-semibold text-gov-ink">{b.block_name}</p>
                      <span className="text-[11px] font-mono text-gov-muted ml-auto">
                        {(b.records_count || 0).toLocaleString('en-IN')} {t('trust.blocks.records')}
                      </span>
                    </div>
                    {/* share of the case, at a glance */}
                    <div className="h-1.5 rounded-full bg-gov-wash mt-1.5 overflow-hidden">
                      <div className="h-full bg-gov-navy/60 rounded-full"
                        style={{ width: `${Math.max(2, ((b.records_count || 0) / maxRecords) * 100)}%` }} />
                    </div>
                    {showHashes && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gov-faint">block</span>
                          <Hash v={b.block_hash} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gov-faint">merkle</span>
                          <Hash v={b.merkle_root} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Certificate ──────────────────────────────────────────────── */}
      <div className="gov-card p-4">
        <h2 className="text-sm font-bold text-gov-ink flex items-center gap-2">
          <Award size={14} className="text-amber-600" />
          {t('trust.cert.title')}
        </h2>
        <p className="text-[11px] text-gov-muted mt-1">{t('trust.cert.help')}</p>

        {!cert ? (
          <p className="text-xs text-gov-faint mt-3">Certificate unavailable for this scope.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <p className="text-[10px] font-semibold text-gov-muted uppercase tracking-wide">ID</p>
                <p className="text-xs font-mono font-bold text-gov-navy break-all">{cert.certificate_id}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gov-muted uppercase tracking-wide">{t('trust.cert.officer')}</p>
                <p className="text-xs text-gov-ink">{cert.certifying_officer || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gov-muted uppercase tracking-wide">{t('trust.cert.issued')}</p>
                <p className="text-xs text-gov-ink font-mono">{cert.timestamp || '—'}</p>
              </div>
            </div>

            <button
              onClick={() => setShowDeclaration(v => !v)}
              className="text-[11px] text-gov-navy hover:underline mt-3 flex items-center gap-1"
            >
              <ChevronDown size={12} className={`transition-transform ${showDeclaration ? '' : '-rotate-90'}`} />
              {showDeclaration ? t('trust.cert.hide') : t('trust.cert.show')}
            </button>

            {showDeclaration && (
              <div className="gov-well p-3 mt-2">
                <p className="text-[11px] text-gov-ink leading-relaxed">{cert.legal_declaration}</p>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gov-border">
                  <span className="text-[10px] text-gov-muted">{t('trust.cert.token')}</span>
                  <Hash v={cert.verification_token} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
