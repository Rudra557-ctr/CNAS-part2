import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FolderOpen, Calendar, Network, GitBranch, FileText,
  Play, Trash2, ArrowLeft, CheckCircle, AlertTriangle,
  BookOpen, Plus, X, Download, RefreshCw, ExternalLink,
  MessageSquare, Send, Activity as ActivityIcon,
} from 'lucide-react'
import {
  getInvestigation, deleteInvestigation, processInvestigation,
  fetchInvGraph, fetchInvStats, fetchInvLeads, fetchInvDetection,
  fetchLiveDossier, pinDossierBlock, unpinDossierBlock,
  fetchActivity, postAnnotation,
} from '../api/client'
import { useAuth, useCanWrite } from '../components/AuthContext'
import ReadOnlyBanner from '../components/ReadOnlyBanner'
import { exportDossierPdf } from '../lib/dossierPdf'
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
  const { username } = useAuth()
  const canWrite = useCanWrite()
  const [meta, setMeta] = useState<any>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0 })
  const [leads, setLeads] = useState<Lead[]>([])
  const [mapStatus, setMapStatus] = useState<Record<string, { ok: boolean; missing: string[] }>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  // Dossier
  const [blocks, setBlocks] = useState<any[]>([])
  const [dosBusy, setDosBusy] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  // Activity
  const [activity, setActivity] = useState<any[]>([])
  const [caseComment, setCaseComment] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)

  const loadActivity = async () => {
    if (!iid) return
    try {
      const { data } = await fetchActivity(iid, 50)
      setActivity(data.events || [])
    } catch { setActivity([]) }
  }

  const postCaseComment = async () => {
    if (!iid || !caseComment.trim()) return
    setCommentBusy(true)
    try {
      await postAnnotation({ target_type: 'case', target_id: 'case', text: caseComment.trim() }, iid)
      setCaseComment('')
      await loadActivity()
    } catch (e: any) { setErr(e.response?.data?.detail || 'Could not post comment.') }
    finally { setCommentBusy(false) }
  }

  const loadDossier = async () => {
    if (!iid) return
    try {
      const { data } = await fetchLiveDossier(iid)
      setBlocks(data.blocks || [])
    } catch { setBlocks([]) }
  }

  const load = async () => {
    if (!iid) return
    setLoading(true); setErr('')
    try {
      const { data: m } = await getInvestigation(iid)
      setMeta(m)
      const graphCounts = m.processing || {}
      setStats({
        nodes: graphCounts.graph_nodes ?? graphCounts.node_count ?? 0,
        edges: graphCounts.graph_edges ?? graphCounts.edge_count ?? 0,
      })

      // Use saved mappings directly from investigation metadata when available
      const files: CaseFile[] = m.files || []
      const statuses: Record<string, { ok: boolean; missing: string[] }> = {}
      const savedMap = m.mapping || {}
      const needFetch: CaseFile[] = []

      for (const f of files) {
        if (savedMap[f.original]) {
          statuses[f.original] = {
            ok: !!savedMap[f.original].validated,
            missing: savedMap[f.original].missing || [],
          }
        } else {
          needFetch.push(f)
        }
      }

      setMapStatus(statuses)
      // Unblock page immediately once metadata is ready
      setLoading(false)

      // Fetch file detections if missing
      if (needFetch.length > 0) {
        Promise.all(needFetch.map(async f => {
          try {
            const { data } = await fetchInvDetection(iid, f.original)
            return { [f.original]: { ok: !!data.validated, missing: data.missing || [] } }
          } catch {
            return { [f.original]: { ok: false, missing: ['detection failed'] } }
          }
        })).then(results => {
          setMapStatus(prev => {
            const updated = { ...prev }
            for (const r of results) Object.assign(updated, r)
            return updated
          })
        }).catch(() => {})
      }

      // Fetch fresh stats asynchronously
      fetchInvStats(iid).then(res => {
        if (res.data?.graph) {
          setStats({
            nodes: res.data.graph.graph_nodes ?? res.data.graph.node_count ?? 0,
            edges: res.data.graph.graph_edges ?? res.data.graph.edge_count ?? 0,
          })
        }
      }).catch(() => {})

      // Fetch top investigative leads asynchronously
      fetchInvLeads(iid).then(res => {
        if (res.data?.leads) {
          setLeads(res.data.leads.slice(0, 5))
        }
      }).catch(() => {})

      // Fetch dossier blocks asynchronously
      fetchLiveDossier(iid).then(res => {
        if (res.data?.blocks) {
          setBlocks(res.data.blocks)
        }
      }).catch(() => {})

      // Fetch case activity asynchronously
      fetchActivity(iid, 50).then(res => {
        if (res.data?.events) {
          setActivity(res.data.events)
        }
      }).catch(() => {})

    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Could not load investigation.')
      setLoading(false)
    }
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

  const openEntity = (id: string) => {
    if (!iid) return
    sessionStorage.setItem('caseId', iid)
    sessionStorage.setItem('caseName', meta?.name || iid)
    sessionStorage.setItem('focusNode', id)
    navigate('/graph')
  }

  const openPair = (src: string, dst: string) => {
    sessionStorage.setItem('explainPair', JSON.stringify({ src, dst }))
    navigate('/explain')
  }

  const addNote = async () => {
    if (!iid || !noteText.trim()) return
    setDosBusy(true)
    try {
      await pinDossierBlock(iid, { kind: 'note', title: noteTitle.trim() || 'Analyst note', text: noteText.trim() })
      setNoteTitle(''); setNoteText(''); setNoteOpen(false)
      await loadDossier()
    } catch (e: any) { setErr(e.response?.data?.detail || 'Could not save note.') }
    finally { setDosBusy(false) }
  }

  const pinSnapshot = async () => {
    if (!iid) return
    setDosBusy(true)
    try {
      await pinDossierBlock(iid, {
        kind: 'stats', title: 'Case snapshot',
        snapshot: { node_count: stats.nodes, edge_count: stats.edges },
      })
      await loadDossier()
    } catch (e: any) { setErr(e.response?.data?.detail || 'Could not pin snapshot.') }
    finally { setDosBusy(false) }
  }

  const unpin = async (bid: string) => {
    if (!iid) return
    try {
      await unpinDossierBlock(iid, bid)
      setBlocks(b => b.filter(x => x.id !== bid))
    } catch (e: any) { setErr(e.response?.data?.detail || 'Could not remove block.') }
  }

  const exportPdf = async () => {
    if (!iid) return
    setDosBusy(true)
    try {
      const { data } = await fetchLiveDossier(iid)
      exportDossierPdf(meta?.name || 'Investigation', iid, username, data.blocks || [])
    } catch (e: any) { setErr(e.response?.data?.detail || 'Export failed.') }
    finally { setDosBusy(false) }
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
          {canWrite && (
          <button onClick={rerun} disabled={busy} className="btn-ghost card disabled:opacity-50">
            <Play size={14} /> {busy ? 'Processing…' : 'Re-run analysis'}
          </button>
          )}
          {canWrite && (!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="btn-ghost card text-red-400 hover:text-red-300">
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <button onClick={remove} disabled={busy} className="btn-ghost card text-red-400 border-red-500/40 disabled:opacity-50">
              <Trash2 size={14} /> Confirm delete?
            </button>
          ))}
        </div>
        {err && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{err}</p>}
        {!canWrite && <div className="mt-3"><ReadOnlyBanner /></div>}
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

      {/* ── Dossier: live-linked report ─────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen size={14} className="text-cyan-400" />
            Investigation Dossier
            <span className="text-[10px] font-mono text-gray-500 bg-dark-700 px-1.5 py-0.5 rounded">{blocks.length}</span>
          </h2>
          <div className="flex gap-2 flex-wrap">
            {canWrite && (
            <button onClick={() => setNoteOpen(o => !o)} className="btn-ghost card text-xs py-1.5">
              <Plus size={12} /> Note
            </button>
            )}
            {canWrite && (
            <button onClick={pinSnapshot} disabled={dosBusy} className="btn-ghost card text-xs py-1.5 disabled:opacity-50">
              <Plus size={12} /> Snapshot
            </button>
            )}
            <button onClick={loadDossier} disabled={dosBusy} className="btn-ghost card text-xs py-1.5 disabled:opacity-50">
              <RefreshCw size={12} /> Refresh live
            </button>
            <button onClick={exportPdf} disabled={dosBusy || blocks.length === 0} className="btn-primary text-xs py-1.5 disabled:opacity-50">
              <Download size={12} /> Export PDF
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mb-3">
          Pinned entities and analyses stay live — values re-resolve on every view and flag when the underlying data changed. Pin from the graph or Why-Connected while this case is open.
        </p>

        {noteOpen && (
          <div className="bg-dark-700 rounded-lg p-3 space-y-2 mb-3">
            <input
              className="input-dark !py-1.5" placeholder="Note title (optional)"
              value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
            />
            <textarea
              className="input-dark" rows={3} placeholder="Observation, hypothesis, next step…"
              value={noteText} onChange={e => setNoteText(e.target.value)}
            />
            <div className="flex justify-end">
              <button onClick={addNote} disabled={dosBusy || !noteText.trim()} className="btn-primary text-xs py-1.5 disabled:opacity-50">
                Save note
              </button>
            </div>
          </div>
        )}

        {blocks.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">
            Empty dossier. Pin entities from the case graph, analyses from Why-Connected, or write the first note above.
          </p>
        ) : (
          <div className="space-y-2">
            {blocks.map(b => (
              <div key={b.id} className="bg-dark-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-dark-500 text-gray-400 uppercase flex-shrink-0">
                      {b.kind}
                    </span>
                    <p className="text-xs text-white font-semibold truncate">
                      {b.title || ({ note: 'Analyst note', entity: b.fresh?.label || 'Entity', explainer: 'Connection analysis', stats: 'Case snapshot' } as any)[b.kind]}
                    </p>
                    {b.changed && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 flex-shrink-0">
                        UPDATED SINCE PINNED
                      </span>
                    )}
                    {b.missing && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 flex-shrink-0">
                        UNRESOLVED
                      </span>
                    )}
                  </div>
                  {canWrite && (
                  <button onClick={() => unpin(b.id)} className="text-gray-600 hover:text-red-400 flex-shrink-0" title="Remove block">
                    <X size={13} />
                  </button>
                  )}
                </div>

                {b.kind === 'note' && b.text && (
                  <p className="text-xs text-gray-300 mt-1.5 whitespace-pre-line">{b.text}</p>
                )}
                {b.kind === 'stats' && b.fresh && (
                  <p className="text-xs text-gray-400 font-mono mt-1.5">
                    {b.fresh.node_count} entities · {b.fresh.edge_count} relationships
                  </p>
                )}
                {b.kind === 'entity' && b.fresh && (
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <p className="text-xs text-gray-400 truncate">
                      {b.fresh.cell ? `Cell ${b.fresh.cell} · ` : ''}{b.fresh.role || ''}
                      {b.fresh.lead_score != null ? ` · lead ${b.fresh.lead_score}` : ''}
                    </p>
                    {b.entity_id && (
                      <button onClick={() => openEntity(b.entity_id)} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 flex-shrink-0">
                        Open <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                )}
                {b.kind === 'explainer' && b.fresh && (
                  <div className="mt-1.5">
                    <p className="text-xs text-gray-300">{b.fresh.relationship_strength} · score {b.fresh.evidence_score}</p>
                    {b.src && b.dst && (
                      <button onClick={() => openPair(b.src, b.dst)} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
                        Open analysis <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                )}
                {b.created_by && (
                  <p className="text-[10px] text-gray-600 font-mono mt-1.5">
                    {b.created_by}{b.created_at ? ` · ${new Date(b.created_at).toLocaleString('en-IN')}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Activity: case discussion + audit trail ───────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ActivityIcon size={14} className="text-green-400" />
            Case Activity
            <span className="text-[10px] font-mono text-gray-500 bg-dark-700 px-1.5 py-0.5 rounded">{activity.length}</span>
          </h2>
          <button onClick={loadActivity} className="btn-ghost card text-xs py-1.5">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {canWrite ? (
          <>
          <input
            className="input-dark flex-1 !py-1.5 text-xs"
            placeholder="Discuss this case with the team… (Enter to post)"
            value={caseComment}
            onChange={e => setCaseComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') postCaseComment() }}
          />
          <button onClick={postCaseComment} disabled={commentBusy || !caseComment.trim()}
            className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50 flex-shrink-0">
            <Send size={12} />
          </button>
          </>
          ) : (
          <p className="text-[11px] text-gov-muted bg-gov-wash border border-gov-border rounded-lg px-3 py-2 w-full">
            Commenting is disabled for the Analyst post.
          </p>
          )}
        </div>

        {activity.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No activity yet — actions on this case will appear here.</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {activity.map((a, i) => (
              <div key={i} className="bg-dark-700 rounded-lg px-3 py-2 flex items-start gap-2">
                {a.kind === 'comment'
                  ? <MessageSquare size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  : <span className="w-2 h-2 rounded-full bg-gray-600 mt-1.5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-200">
                    <span className="font-mono text-gray-400">{a.actor || 'system'}</span>
                    {' · '}{a.summary}
                  </p>
                  {a.text && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{a.text}</p>}
                  <p className="text-[10px] text-gray-600 font-mono mt-0.5">
                    {a.ts ? new Date(a.ts).toLocaleString('en-IN') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
