import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvestigations, createInvestigation, uploadFiles } from '../api/client'
import { useCanWrite } from '../components/AuthContext'
import ReadOnlyBanner from '../components/ReadOnlyBanner'
import { FolderOpen, Plus, Calendar, Users, Upload } from 'lucide-react'

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
    s === 'active' ? 'text-green-400 bg-green-500/10 border-green-500/20'
    : s === 'closed' ? 'text-gray-400 bg-dark-700 border-dark-500'
    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderOpen size={20} className="text-cyan-400" />
            Investigation Cases
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Create and manage analyst-led criminal investigations
          </p>
        </div>
      </div>

      {/* New case */}
      {!canWrite && <ReadOnlyBanner />}
      {canWrite && (
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Open New Investigation</h2>
        <div className="space-y-2">
          <input
            className="input-dark"
            placeholder="Investigation name, e.g. Operation Cobra"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
          />
          <div className="flex gap-2">
            <input
              className="input-dark flex-1"
              placeholder="Description (optional)"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
            />
            <button onClick={create} disabled={busy || !name.trim()} className="btn-primary disabled:opacity-50">
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
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FolderOpen size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm">No investigations yet</p>
          <p className="text-xs mt-1">Create your first investigation above</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {cases.map((c: any, i) => (
            <div
              key={c.id || i}
              onClick={() => { const id = c.id || c.investigation_id; if (id) navigate(`/cases/${id}`) }}
              className="card p-4 hover:border-dark-400 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">{c.name || c.investigation_name || `Case #${i+1}`}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${statusColor(c.status || 'active')}`}>
                  {c.status || 'active'}
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
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
                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{c.description}</p>
              )}
              {/* Evidence upload */}
              {canWrite && (
              <div className="mt-3 pt-3 border-t border-dark-600" onClick={e => e.stopPropagation()}>
                <label className="flex items-center gap-2 text-xs text-gray-400 hover:text-white cursor-pointer">
                  <Upload size={12} />
                  {uploadingId === (c.id || c.investigation_id) ? 'Uploading…' : 'Upload evidence (CSV / XLSX / PDF / JSON / ZIP)'}
                  <input
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls,.json,.zip,.txt,.tsv,.log,.pdf,.docx"
                    className="hidden"
                    disabled={uploadingId != null}
                    onChange={e => { upload(c.id || c.investigation_id, e.target.files); e.target.value = '' }}
                  />
                </label>
                {uploadMsg[c.id || c.investigation_id] && (
                  <p className="text-[11px] text-gray-500 mt-1">{uploadMsg[c.id || c.investigation_id]}</p>
                )}
              </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
