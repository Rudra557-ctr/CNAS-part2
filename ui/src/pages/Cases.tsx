import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvestigations, createInvestigation, uploadFiles, deleteInvestigation } from '../api/client'
import { useCanWrite } from '../components/AuthContext'
import ReadOnlyBanner from '../components/ReadOnlyBanner'
import { FolderOpen, Plus, Calendar, Users, Upload, Trash2 } from 'lucide-react'

export default function Cases() {
  const navigate = useNavigate()
  const canWrite = useCanWrite()
  const [cases,   setCases]   = useState<any[]>([])
  const [name,    setName]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [loading, setLoading] = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadMsg,   setUploadMsg]   = useState<Record<string, string>>({})
  const [delConfirm,  setDelConfirm]  = useState<string | null>(null)
  const [delBusy,     setDelBusy]     = useState(false)

  const load = () => {
    setLoading(true)
    listInvestigations()
      .then(r => setCases(r.data.investigations || r.data || []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createInvestigation(name.trim(), desc.trim())
      setName(''); setDesc('')
      load()
    } catch(e) { console.error(e) }
    finally { setBusy(false) }
  }

  // Delete one case from history. Two clicks: arm, then confirm.
  const remove = async (iid: string) => {
    setDelBusy(true)
    try {
      await deleteInvestigation(iid)
      // A deleted case must not linger as the open graph scope.
      if (sessionStorage.getItem('caseId') === iid) {
        sessionStorage.removeItem('caseId')
        sessionStorage.removeItem('caseName')
      }
      setDelConfirm(null)
      load()
    } catch (e) { console.error(e) }
    finally { setDelBusy(false) }
  }

  const upload = async (iid: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingId(iid)
    setUploadMsg(m => ({ ...m, [iid]: '' }))
    try {
      const { data } = await uploadFiles(iid, Array.from(files))
      const n = data.saved?.length ?? data.files?.length ?? files.length
      setUploadMsg(m => ({ ...m, [iid]: `Uploaded ${n} file(s) — schema auto-detected.` }))
    } catch (e: any) {
      setUploadMsg(m => ({ ...m, [iid]: e.response?.data?.detail || 'Upload failed.' }))
    } finally { setUploadingId(null) }
  }

  const statusColor = (s: string) =>
    s === 'active' ? 'text-green-700 bg-green-50 border-green-200'
    : s === 'closed' ? 'text-gov-muted bg-gov-wash border-gov-border'
    : 'text-yellow-700 bg-yellow-50 border-yellow-200'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gov-ink flex items-center gap-2">
            <FolderOpen size={20} className="text-gov-navy" />
            Investigation Cases
          </h1>
          <p className="text-xs text-gov-muted mt-0.5">
            Create and manage analyst-led criminal investigations
          </p>
        </div>
      </div>

      {/* New case */}
      {!canWrite && <ReadOnlyBanner />}
      {canWrite && (
      <div className="gov-card p-4">
        <h2 className="text-sm font-semibold text-gov-ink mb-3">Open New Investigation</h2>
        <div className="space-y-2">
          <input
            className="gov-input"
            placeholder="Investigation name, e.g. Operation Cobra"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
          />
          <div className="flex gap-2">
            <input
              className="gov-input flex-1"
              placeholder="Description (optional)"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
            />
            <button onClick={create} disabled={busy || !name.trim()} className="gov-btn disabled:opacity-50">
              <Plus size={16} />
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Case list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-gov-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 text-gov-muted">
          <FolderOpen size={40} className="mx-auto mb-3 text-gov-faint" />
          <p className="text-sm">No investigations yet</p>
          <p className="text-xs mt-1">Create your first investigation above</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {cases.map((c: any, i) => {
            const cid = c.id || c.investigation_id
            return (
            <div
              key={c.id || i}
              onClick={() => { if (cid) navigate(`/cases/${cid}`) }}
              className="gov-card p-4 hover:border-gov-navy transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gov-ink">{c.name || c.investigation_name || `Case #${i+1}`}</h3>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${statusColor(c.status || 'active')}`}>
                    {c.status || 'active'}
                  </span>
                  {canWrite && cid && (delConfirm === cid ? (
                    <button
                      onClick={e => { e.stopPropagation(); remove(cid) }}
                      disabled={delBusy}
                      title="Confirm delete — removes the case and its graph"
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-red-300 bg-red-50 text-gov-red disabled:opacity-50"
                    >
                      {delBusy ? '…' : 'Confirm?'}
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setDelConfirm(cid) }}
                      title="Delete this case"
                      className="p-1 rounded text-gov-faint hover:text-gov-red hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-gov-muted">
                <div className="flex items-center gap-2">
                  <Calendar size={11} />
                  <span>{c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : 'Today'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={11} />
                  <span>{(c.files || []).length} evidence file{(c.files || []).length === 1 ? '' : 's'}</span>
                </div>
              </div>
              {c.description && (
                <p className="text-xs text-gov-muted mt-2 line-clamp-2">{c.description}</p>
              )}
              {/* Evidence upload */}
              {canWrite && (
              <div className="mt-3 pt-3 border-t border-gov-border" onClick={e => e.stopPropagation()}>
                <label className="flex items-center gap-2 text-xs text-gov-muted hover:text-gov-ink cursor-pointer">
                  <Upload size={12} />
                  {uploadingId === cid ? 'Uploading…' : 'Upload evidence (CSV / XLSX / PDF / JSON / ZIP)'}
                  <input
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls,.json,.zip,.txt,.tsv,.log,.pdf,.docx"
                    className="hidden"
                    disabled={uploadingId != null}
                    onChange={e => { if (cid) upload(cid, e.target.files); e.target.value = '' }}
                  />
                </label>
                {cid && uploadMsg[cid] && (
                  <p className="text-[11px] text-gov-muted mt-1">{uploadMsg[cid]}</p>
                )}
              </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
