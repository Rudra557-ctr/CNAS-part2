import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FolderOpen, Calendar, Network, GitBranch, FileText,
  Play, Trash2, ArrowLeft, CheckCircle, AlertTriangle,
} from 'lucide-react'
import {
  getInvestigation, deleteInvestigation, processInvestigation,
  fetchInvGraph, fetchInvLeads, fetchInvDetection,
} from '../api/client'
import type { Lead } from '../types'

interface CaseFile {
  original: string
  format: string
  detected_type: string
  type_confidence?: number
  columns?: string[]
}

export default function CaseDetail() {
  const { iid } = useParams<{ iid: string }>()
  const navigate = useNavigate()
  const [meta, setMeta] = useState<any>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })
  const [leads, setLeads] = useState<Lead[]>([])
  const [mapStatus, setMapStatus] = useState<Record<string, { ok: boolean; missing: string[] }>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const load = async () => {
    if (!iid) return
    setLoading(true); setErr('')
    try {
      const [{ data: m }, g, l] = await Promise.all([
        getInvestigation(iid),
        fetchInvGraph(iid).catch(() => ({ data: null })),
        fetchInvLeads(iid).catch(() => ({ data: null })),
      ])
      setMeta(m)
      if (g.data) setStats({
        nodes: g.data.stats?.node_count ?? g.data.nodes?.length ?? 0,
        edges: g.data.stats?.edge_count ?? g.data.edges?.length ?? 0,
      })
      if (l.data) setLeads((l.data.leads || []).slice(0, 5))
      // Mapping status per file (validated vs needs analyst review)
      const files: CaseFile[] = m.files || []
      const statuses: Record<string, { ok: boolean; missing: string[] }> = {}
      await Promise.all(files.map(async f => {
        try {
          const { data } = await fetchInvDetection(iid, f.original)
          statuses[f.original] = { ok: !!data.validated, missing: data.missing || [] }
        } catch { statuses[f.original] = { ok: false, missing: ['detection failed'] } }
      }))
      setMapStatus(statuses)
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Could not load investigation.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [iid])

  const rerun = async () => {
    if (!iid) return
    setBusy(true)
    try { await processInvestigation(iid); await load() }
    catch (e: any) { setErr(e.response?.data?.detail || 'Processing failed.') }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (!iid) return
    setBusy(true)
    try { await deleteInvestigation(iid); navigate('/cases') }
    catch (e: any) { setErr(e.response?.data?.detail || 'Delete failed.'); setBusy(false) }
  }

  const openGraph = () => {
    if (!iid) return
    sessionStorage.setItem('caseId', iid)
    sessionStorage.setItem('caseName', meta?.name || iid)
    navigate('/graph')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (err && !meta) return (
    <div className="space-y-4">
      <button onClick={() => navigate('/cases')} className="btn-ghost"><ArrowLeft size={14} /> Back to Cases</button>
      <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3">{err}</p>
    </div>
  )

  const files: CaseFile[] = meta?.files || []
  const status = meta?.status || 'unknown'

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={() => navigate('/cases')} className="btn-ghost">
        <ArrowLeft size={14} /> Back to Cases
      </button>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderOpen size={20} className="text-cyan-400" />
              {meta?.name || 'Investigation'}
            </h1>
            {meta?.description && <p className="text-xs text-gray-500 mt-1">{meta.description}</p>}
            <p className="text-[11px] text-gray-600 font-mono mt-1.5 flex items-center gap-2">
              <Calendar size={11} />
              {meta?.created ? new Date(meta.created).toLocaleString('en-IN') : ''} · {iid}
            </p>
          </div>
          <span className={`text-[11px] px-2.5 py-1 rounded-full border font-mono ${
            status === 'completed' ? 'text-green-400 bg-green-500/10 border-green-500/20'
            : status === 'processing' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
            : 'text-gray-400 bg-dark-700 border-dark-500'
          }`}>
            {status}
          </span>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <button onClick={openGraph} className="btn-primary">
            <Network size={14} /> Open case graph
          </button>
          <button onClick={rerun} disabled={busy} className="btn-ghost card disabled:opacity-50">
            <Play size={14} /> {busy ? 'Processing…' : 'Re-run analysis'}
          </button>
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="btn-ghost card text-red-400 hover:text-red-300">
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <button onClick={remove} disabled={busy} className="btn-ghost card text-red-400 border-red-500/40 disabled:opacity-50">
              <Trash2 size={14} /> Confirm delete?
            </button>
          )}
        </div>
        {err && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{err}</p>}
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Evidence files', value: files.length },
          { label: 'Graph entities', value: stats.nodes },
          { label: 'Relationships', value: stats.edges },
          { label: 'Priority leads', value: leads.length },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <span className="text-xs text-gray-500">{s.label}</span>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        {/* Evidence files */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <FileText size={14} className="text-blue-400" /> Evidence files ({files.length})
          </h2>
          {files.length === 0 ? (
            <p className="text-xs text-gray-500">No files yet — upload evidence from this page's case card.</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => {
                const ms = mapStatus[f.original]
                return (
                  <div key={f.original} className="bg-dark-700 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white font-mono truncate">{f.original}</p>
                      {ms && (
                        ms.ok
                          ? <span className="flex items-center gap-1 text-[10px] text-green-400 flex-shrink-0"><CheckCircle size={11} /> mapped</span>
                          : <span className="flex items-center gap-1 text-[10px] text-yellow-400 flex-shrink-0"><AlertTriangle size={11} /> review{ms.missing.length ? `: ${ms.missing.slice(0, 2).join(', ')}` : ''}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {f.format?.toUpperCase()} · detected <span className="font-mono text-gray-400">{f.detected_type}</span>
                      {f.type_confidence != null ? ` (${Math.round(f.type_confidence * 100)}%)` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Case leads */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <GitBranch size={14} className="text-red-400" /> Top leads in this case
          </h2>
          {leads.length === 0 ? (
            <p className="text-xs text-gray-500">No leads yet — run analysis first.</p>
          ) : (
            <div className="space-y-2">
              {leads.map(l => (
                <div key={l.entity_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{l.label}</p>
                    <p className="text-[10px] text-gray-500 truncate">{(l.reasons || [])[0] || l.role || ''}</p>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${
                    l.priority === 'HIGH' ? 'text-red-400 border-red-500/30 bg-red-500/10'
                    : l.priority === 'MEDIUM' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                    : 'text-green-400 border-green-500/30 bg-green-500/10'
                  }`}>
                    {l.priority} · {l.lead_score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
