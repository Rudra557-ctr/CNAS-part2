import { useCallback, useState } from 'react'
import {
  MicVocal, Mic, Square, AudioLines, Loader2, Check, AlertTriangle,
  HelpCircle, Database, GitBranch, X,
} from 'lucide-react'
import { postVoiceIngest, commitVoiceIngest } from '../api/client'
import { useVoiceRecorder } from '../lib/useVoiceRecorder'
import { useCaseScope, CaseScopeBar } from '../components/CaseScope'
import { useLang } from '../i18n/LanguageContext'

// Dictating a change to the case record is not dictating a question, so this
// screen is deliberately not the Ask screen. Two steps, always: the system
// shows its reading of what was said and which existing record it resolved to,
// and only a second, explicit press writes anything. An officer should never
// discover what was recorded by finding it in the graph afterwards.

interface Candidate {
  id: string; name: string; name_hi: string | null
  role: string | null; cell: string | null; phone: string | null; score: number
}
interface Side {
  spoken: string
  status: 'resolved' | 'ambiguous' | 'absent'
  person: Candidate | null
  candidates: Candidate[]
  score?: number
}
interface Preview {
  success: boolean
  transcription: string
  status: string
  operation: string | null
  summary: string
  message: string
  scope: string
  universe_size: number
  creates: string[]
  command: Record<string, unknown>
  subject: Side | null
  object: Side | null
  changes: string[]
  understood: string[]
  ignored: string[]
  requires_confirmation: boolean
}
interface Committed {
  success: boolean
  status: string
  message: string
  entity_id: string | null
  files_written: string[]
  pipeline: string
  verification: {
    verified: boolean
    checks: Array<{ check: string; ok: boolean }>
    node_count: number
    edge_count: number
  }
}

// Statuses that mean "nothing was written, and nothing will be until you say
// more". Each is a refusal with a reason, not an error.
const REFUSALS = ['ambiguous', 'duplicate', 'not_found', 'invalid', 'unrecognised']

const EXAMPLES_EN = [
  'Add a new person named Rajesh Kumar, phone number 9876543210, associated with Ramesh Yadav',
  "Update Ramesh Yadav's role to Financier",
  'Anwar Sheikh is linked to Suresh Rane through a financial transaction',
]
const EXAMPLES_HI = [
  'Add a new person named Rajesh Kumar, phone number 9876543210',
  "Update Meena Joshi's phone number to 9876500000",
  'Anwar Sheikh is linked to Kavita Desai through phone calls',
]

function StatusPill({ status }: { status: string }) {
  const tone = status === 'ready' || status === 'committed'
    ? 'bg-green-50 text-green-800 border-green-200'
    : status === 'ambiguous'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-red-50 text-gov-red border-red-200'
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function ResolvedSide({ label, side, onPick }: {
  label: string; side: Side | null; onPick?: (c: Candidate) => void
}) {
  if (!side) return null
  return (
    <div className="border border-gov-border rounded-lg p-2.5 bg-white">
      <p className="text-[10px] uppercase tracking-wide text-gov-faint mb-1">{label}</p>
      <p className="text-sm text-gov-ink">
        “{side.spoken}”
        {side.person && (
          <>
            {' → '}
            <span className="font-semibold">{side.person.name}</span>
            <span className="font-mono text-xs text-gov-muted ml-1">{side.person.id}</span>
            {side.person.name_hi && (
              <span className="text-xs text-gov-muted ml-1">({side.person.name_hi})</span>
            )}
            {typeof side.score === 'number' && (
              <span className="text-[10px] text-gov-faint ml-1.5">{side.score}% match</span>
            )}
          </>
        )}
      </p>
      {/* An ambiguous name is shown with every record it could be, because the
          officer is the only one who can break the tie. */}
      {side.status !== 'resolved' && side.candidates.length > 0 && (
        <>
          {onPick && side.status === 'ambiguous' && (
            <p className="text-[10px] text-gov-faint mt-1.5">
              Pick the right record — the command is rewritten with that ID and re-read.
            </p>
          )}
          <ul className="mt-1 space-y-1">
            {side.candidates.map(c => (
              <li key={c.id}>
                {onPick && side.status === 'ambiguous' ? (
                  <button
                    onClick={() => onPick(c)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded border border-gov-border
                               hover:border-gov-navy hover:bg-gov-wash transition-colors"
                  >
                    <span className="font-mono text-gov-navy">{c.id}</span>{' '}
                    <span className="text-gov-ink font-medium">{c.name}</span>
                    {c.role && <span className="text-gov-faint"> · {c.role}</span>}
                    {c.phone && <span className="text-gov-faint font-mono"> · {c.phone}</span>}
                    <span className="text-gov-faint"> · {c.score}%</span>
                  </button>
                ) : (
                  <span className="text-xs text-gov-muted">
                    <span className="font-mono">{c.id}</span> {c.name}
                    {c.role && <span className="text-gov-faint"> · {c.role}</span>}
                    <span className="text-gov-faint"> · {c.score}%</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {side.status === 'absent' && side.candidates.length === 0 && (
        <p className="text-xs text-gov-faint mt-1">No existing record resembles this name.</p>
      )}
    </div>
  )
}

export default function Ingest() {
  const { t, lang } = useLang()
  const { iid, caseName, clear } = useCaseScope()
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Committed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)

  // Ambiguity is resolved the way the message asks for — by naming the ID —
  // except the officer clicks instead of dictating it again. The spoken name in
  // the command is swapped for the chosen ID and the command is re-read, so the
  // write still goes through the same parse, plan and confirm as any other.
  const pickCandidate = useCallback((c: Candidate) => {
    const spoken = [preview?.subject, preview?.object]
      .find(s => s && s.status === 'ambiguous' && s.candidates.some(x => x.id === c.id))?.spoken
    const base = typed || preview?.transcription || ''
    const next = spoken
      ? base.replace(new RegExp(spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), c.id)
      : base
    setTyped(next)
    interpret(next)
  }, [preview, typed])

  const interpret = useCallback(async (input: File | string) => {
    setError(null); setPreview(null); setDone(null); setBusy(true)
    try {
      const { data } = await postVoiceIngest(input, iid)
      setPreview(data)
      if (data.transcription) setTyped(data.transcription)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Could not interpret that command.')
    } finally {
      setBusy(false)
    }
  }, [iid])

  // The recorder hook is shared with the Ask page — one microphone
  // implementation, one upload path, one Whisper model.
  const voice = useVoiceRecorder(useCallback(
    (file: File) => interpret(file), [interpret]))

  const commit = async () => {
    if (!preview?.command) return
    setCommitting(true); setError(null)
    try {
      const { data } = await commitVoiceIngest(preview.command, iid)
      setDone(data)
      setPreview(null)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'The write failed and was rolled back.')
    } finally {
      setCommitting(false)
    }
  }

  const working = busy || voice.state === 'processing'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gov-ink">{t('ingest.title')}</h1>
          <p className="text-xs text-gov-muted mt-0.5">{t('ingest.subtitle')}</p>
        </div>
        {iid && <CaseScopeBar caseName={caseName} caseId={iid} onClear={clear} />}
      </div>

      {/* Dictate */}
      <div className="gov-card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MicVocal
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gov-faint"
            />
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && typed.trim() && interpret(typed.trim())}
              placeholder={t('ingest.placeholder')}
              className="gov-input w-full pl-9 text-sm py-2"
            />
          </div>
          {voice.supported && (
            voice.state === 'recording' ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={voice.cancel}
                  title={t('ingest.voice.cancel')}
                  className="px-3 text-sm rounded-lg border border-gov-border bg-white text-gov-muted
                             font-semibold flex items-center gap-1.5"
                >
                  <X size={13} />
                  {t('ingest.voice.cancel')}
                </button>
                <button
                  onClick={voice.stop}
                  title={t('ingest.voice.done')}
                  className="px-4 text-sm rounded-lg border border-red-300 bg-red-50 text-gov-red
                             font-semibold flex items-center gap-2"
                >
                  <Square size={13} className="fill-current" />
                  {t('ingest.voice.done')} · {voice.seconds}s
                  <span className="w-2 h-2 rounded-full bg-gov-red animate-pulse" />
                </button>
              </div>
            ) : (
              <button
                onClick={voice.start}
                disabled={working}
                title={t('ingest.voice.start')}
                className="px-3 text-sm rounded-lg border border-gov-border bg-white text-gov-navy
                           hover:border-gov-navy flex items-center gap-2 flex-shrink-0
                           disabled:opacity-60"
              >
                {voice.state === 'processing'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Mic size={15} />}
                <span className="hidden sm:inline">
                  {voice.state === 'processing'
                    ? t('ingest.voice.processing') : t('ingest.voice.start')}
                </span>
              </button>
            )
          )}
          <button
            onClick={() => typed.trim() && interpret(typed.trim())}
            disabled={working || !typed.trim()}
            className="gov-btn px-4 text-sm disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : t('ingest.button')}
          </button>
        </div>

        {voice.state === 'recording' && (
          <div className="flex items-center gap-2 text-xs text-gov-red">
            <AudioLines size={14} className="animate-pulse" />
            {t('ingest.voice.recording')} — {voice.seconds}s
          </div>
        )}
        {working && voice.state !== 'recording' && (
          <div className="flex items-center gap-2 text-xs text-gov-muted">
            <Loader2 size={14} className="animate-spin" />
            {t('ingest.voice.transcribing')}
          </div>
        )}
        {voice.error && (
          <div className="flex items-start gap-2 text-xs text-gov-red">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{voice.error.message}</span>
            <button onClick={voice.clearError} className="underline text-gov-muted ml-1">
              {t('ingest.voice.dismiss')}
            </button>
          </div>
        )}
        {!voice.supported && (
          <p className="text-[10px] text-gov-faint">{t('ingest.voice.unsupported')}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {(lang === 'hi' ? EXAMPLES_HI : EXAMPLES_EN).map(ex => (
            <button
              key={ex}
              onClick={() => { setTyped(ex); interpret(ex) }}
              className="text-[11px] px-2 py-1 rounded border border-gov-border text-gov-muted
                         hover:border-gov-navy hover:text-gov-navy text-left"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="gov-card p-3 flex items-start gap-2 text-sm text-gov-red">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Interpretation — always shown before anything is written */}
      {preview && (
        <div className="gov-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gov-ink">{t('ingest.heard')}</h2>
            <StatusPill status={preview.status} />
          </div>
          <p className="text-sm text-gov-ink">“{preview.transcription}”</p>
          <p className="text-[11px] text-gov-faint">
            {t('ingest.resolvedAgainst')} {preview.scope} · {preview.universe_size} {t('ingest.people')}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="border border-gov-border rounded-lg p-2.5 bg-white">
              <p className="text-[10px] uppercase tracking-wide text-gov-faint mb-1">
                {t('ingest.operation')}
              </p>
              <p className="text-sm text-gov-ink font-medium">
                {preview.operation || '—'}
              </p>
              <p className="text-xs text-gov-muted mt-0.5">{preview.summary}</p>
            </div>
            <ResolvedSide label={t('ingest.subject')} side={preview.subject}
              onPick={preview.status === 'ambiguous' ? pickCandidate : undefined} />
            <ResolvedSide label={t('ingest.object')} side={preview.object}
              onPick={preview.status === 'ambiguous' ? pickCandidate : undefined} />
          </div>

          {preview.changes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gov-faint mb-1">
                {t('ingest.changes')}
              </p>
              <ul className="space-y-0.5">
                {preview.changes.map(c => (
                  <li key={c} className="text-xs text-gov-ink flex items-start gap-1.5">
                    <GitBranch size={12} className="mt-0.5 text-gov-faint flex-shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.creates?.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-gov-navy">
              <Database size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                {t('ingest.willCreate')}{' '}
                <span className="font-medium">{preview.creates.join(', ')}</span>
              </span>
            </div>
          )}

          {/* Same honesty contract the query page keeps: a word the parser
              could not place is listed, never silently dropped. */}
          {preview.ignored.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-800">
              <HelpCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                {t('ingest.ignored')}{' '}
                <span className="font-mono">{preview.ignored.join(', ')}</span>
              </span>
            </div>
          )}

          <div className={`text-sm rounded-lg p-2.5 ${
            preview.status === 'ready'
              ? 'bg-green-50 text-green-900'
              : REFUSALS.includes(preview.status)
                ? 'bg-amber-50 text-amber-900'
                : 'bg-gov-bg text-gov-muted'}`}>
            {preview.message}
          </div>

          {preview.status === 'ready' && (
            <div className="flex items-center gap-2">
              <button
                onClick={commit}
                disabled={committing}
                className="gov-btn px-4 text-sm disabled:opacity-60 flex items-center gap-2"
              >
                {committing
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Database size={14} />}
                {committing ? t('ingest.committing') : t('ingest.confirm')}
              </button>
              <button
                onClick={() => setPreview(null)}
                className="text-sm text-gov-muted underline"
              >
                {t('ingest.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation — what was written, and proof it landed in the graph */}
      {done && (
        <div className="gov-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-green-700" />
            <h2 className="text-sm font-semibold text-gov-ink">{done.message}</h2>
            <StatusPill status={done.status} />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-gov-faint mb-1">
              {t('ingest.written')}
            </p>
            <ul className="space-y-0.5">
              {done.files_written.map(f => (
                <li key={f} className="text-xs font-mono text-gov-ink">{f}</li>
              ))}
            </ul>
            <p className="text-[11px] text-gov-muted mt-1.5">
              {t('ingest.pipeline')} <span className="font-mono">{done.pipeline}</span>
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-gov-faint mb-1">
              {t('ingest.verified')}
            </p>
            <ul className="space-y-0.5">
              {done.verification.checks.map(c => (
                <li key={c.check} className="text-xs flex items-center gap-1.5">
                  {c.ok
                    ? <Check size={12} className="text-green-700 flex-shrink-0" />
                    : <AlertTriangle size={12} className="text-gov-red flex-shrink-0" />}
                  <span className={c.ok ? 'text-gov-ink' : 'text-gov-red'}>{c.check}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gov-muted mt-1.5">
              {t('ingest.graphnow')} {done.verification.node_count} nodes ·{' '}
              {done.verification.edge_count} edges
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
