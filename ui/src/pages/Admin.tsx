import { useEffect, useState } from 'react'
import {
  ShieldCheck, UserPlus, Check, X, RotateCcw, Ban, Search, ScrollText, Trash2,
} from 'lucide-react'
import {
  adminListUsers, adminCreateUser, adminApproveUser, adminRejectUser,
  adminSetUserStatus, adminResetPassword, adminAuditTrail, adminDeleteUser,
} from '../api/client'
import { useAuth } from '../components/AuthContext'

interface U {
  username: string; role: string; name: string; badge_id: string
  department: string; status: string; created_at?: string | null
  approved_by?: string | null; rejection_reason?: string | null
}

// Shipped with the application; the API refuses to modify them.
const SEED_ACCOUNTS = ['admin', 'analyst', 'investigator']

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-50 text-green-800 border-green-200',
  pending_approval: 'bg-amber-50 text-amber-800 border-amber-200',
  suspended: 'bg-slate-100 text-slate-600 border-slate-300',
  rejected: 'bg-red-50 text-gov-red border-red-200',
}

export default function Admin() {
  const { username: me } = useAuth()
  const [tab, setTab] = useState<'queue' | 'users' | 'create' | 'audit'>('queue')
  const [users, setUsers] = useState<U[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  // Deleting an officer is irreversible, so the button arms first and only the
  // second click on the same row goes through.
  const [confirmDelete, setConfirmDelete] = useState('')
  const [rejectFor, setRejectFor] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [form, setForm] = useState({
    username: '', password: '', role: 'investigator',
    name: '', badge_id: '', department: '',
  })

  const load = async () => {
    setErr('')
    try {
      const [{ data: u }, { data: a }] = await Promise.all([
        adminListUsers(search ? { search } : undefined),
        adminAuditTrail({ limit: 100 }),
      ])
      setUsers(u.users || [])
      setEvents(a.events || [])
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Could not load admin data.')
    }
  }

  useEffect(() => { load() }, [])

  const act = async (label: string, fn: () => Promise<any>, done?: string) => {
    setBusy(label); setErr(''); setMsg('')
    try {
      const r = await fn()
      if (done) setMsg(done)
      await load()
      return r
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Action failed.')
    } finally {
      setBusy('')
    }
  }

  const pending = users.filter(u => u.status === 'pending_approval')
  const field = 'gov-input'

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <ShieldCheck size={20} className="text-gov-navy" />
          Administration
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">
          Access permissions, officer accounts and the audit trail. Admin role only.
        </p>
      </div>

      {err && <p className="text-xs text-gov-red bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {msg && <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{msg}</p>}

      <div className="flex gap-2 flex-wrap">
        {([
          ['queue', `Approval queue (${pending.length})`],
          ['users', 'Officers'],
          ['create', 'Create account'],
          ['audit', 'Audit trail'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              tab === id ? 'bg-gov-navy border-gov-navy text-white' : 'bg-white border-gov-border text-gov-muted hover:text-gov-ink'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gov-faint" />
          <input
            className="gov-input !py-1.5 !text-xs pl-8 !w-52"
            placeholder="Search name, badge…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load() }}
          />
        </div>
      </div>

      {tab === 'queue' && (
        <div className="gov-card p-4">
          {pending.length === 0 ? (
            <p className="text-xs text-gov-faint text-center py-8">No pending requests. New access requests will appear here.</p>
          ) : (
            <div className="space-y-3">
              {pending.map(u => (
                <div key={u.username} className="border border-gov-border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-bold text-gov-ink">
                        {u.name} <span className="font-mono font-normal text-gov-muted">@{u.username}</span>
                      </p>
                      <p className="text-xs text-gov-muted mt-0.5">
                        Applied for post: <b className="capitalize">{u.role}</b>
                        {u.badge_id ? ` · Badge ${u.badge_id}` : ''}{u.department ? ` · ${u.department}` : ''}
                      </p>
                      <p className="text-[11px] text-gov-faint mt-0.5">
                        Requested {u.created_at ? new Date(u.created_at).toLocaleString('en-IN') : '—'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!!busy}
                        onClick={() => act(`approve-${u.username}`,
                          () => adminApproveUser(u.username),
                          `${u.username} approved as ${u.role}. Share their user ID and password with them.`)}
                        className="gov-btn !py-1.5 !text-xs disabled:opacity-50"
                      >
                        <Check size={13} /> {busy === `approve-${u.username}` ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() => { setRejectFor(rejectFor === u.username ? '' : u.username); setRejectReason('') }}
                        className="gov-ghost border border-gov-border !py-1.5 !text-xs"
                      >
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </div>
                  {rejectFor === u.username && (
                    <div className="flex gap-2 mt-3">
                      <input
                        className={field}
                        placeholder="Reason — e.g. You are not eligible for this post"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                      />
                      <button
                        disabled={!!busy || !rejectReason.trim()}
                        onClick={() => act(`reject-${u.username}`,
                          () => adminRejectUser(u.username, rejectReason.trim()),
                          `${u.username} rejected. They will see the reason at sign-in.`)}
                        className="gov-btn !py-1.5 !text-xs !bg-gov-red disabled:opacity-50 flex-shrink-0"
                      >
                        Confirm reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="gov-card p-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gov-border text-left text-gov-muted">
                {['Officer', 'Post', 'Badge / Dept', 'Status', 'Actions'].map(h => (
                  <th key={h} className="font-semibold py-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.username} className="border-b border-gov-border last:border-0 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-bold text-gov-ink">{u.name}</p>
                    <p className="font-mono text-[11px] text-gov-faint">@{u.username}</p>
                    {u.status === 'rejected' && u.rejection_reason && (
                      <p className="text-[11px] text-gov-red mt-0.5">Rejected: {u.rejection_reason}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3 capitalize text-gov-ink">{u.role}</td>
                  <td className="py-2 pr-3 text-gov-muted">
                    {u.badge_id || '—'}{u.department ? <span className="block text-[11px]">{u.department}</span> : null}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[u.status] || STATUS_STYLE.active}`}>
                      {u.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {u.status === 'active' && (
                        <button disabled={!!busy} title="Suspend"
                          onClick={() => act(`sus-${u.username}`, () => adminSetUserStatus(u.username, 'suspended'), `${u.username} suspended.`)}
                          className="gov-ghost border border-gov-border !p-1.5"><Ban size={12} /></button>
                      )}
                      {u.status === 'suspended' && (
                        <button disabled={!!busy} title="Reactivate"
                          onClick={() => act(`act-${u.username}`, () => adminSetUserStatus(u.username, 'active'), `${u.username} reactivated.`)}
                          className="gov-ghost border border-gov-border !p-1.5"><Check size={12} /></button>
                      )}
                      <button disabled={!!busy} title="Reset password"
                        onClick={async () => {
                          const r = await act(`pw-${u.username}`, () => adminResetPassword(u.username))
                          if (r?.data?.temporary_password) {
                            setMsg(`Temporary password for ${u.username}: ${r.data.temporary_password} — share it securely.`)
                          }
                        }}
                        className="gov-ghost border border-gov-border !p-1.5"><RotateCcw size={12} /></button>

                      {/* Seed accounts and your own login are never deletable. */}
                      {!SEED_ACCOUNTS.includes(u.username) && u.username !== me && (
                        confirmDelete === u.username ? (
                          <span className="flex items-center gap-1">
                            <button disabled={!!busy} title="Confirm deletion"
                              onClick={async () => {
                                setConfirmDelete('')
                                await act(`del-${u.username}`, () => adminDeleteUser(u.username),
                                  `${u.username} deleted.`)
                              }}
                              className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-gov-red text-white hover:opacity-90">
                              Delete?
                            </button>
                            <button onClick={() => setConfirmDelete('')} title="Cancel"
                              className="gov-ghost border border-gov-border !p-1.5"><X size={12} /></button>
                          </span>
                        ) : (
                          <button disabled={!!busy} title="Delete officer"
                            onClick={() => setConfirmDelete(u.username)}
                            className="gov-ghost border border-gov-border !p-1.5 text-gov-red hover:border-gov-red">
                            <Trash2 size={12} />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'create' && (
        <div className="gov-card p-6 max-w-xl">
          <h2 className="text-sm font-bold text-gov-ink mb-1 flex items-center gap-2">
            <UserPlus size={14} /> Provision account directly
          </h2>
          <p className="text-xs text-gov-muted mb-4">Active immediately. Hand the user ID and password to the officer as per their posting.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gov-ink block mb-1">User ID</label>
                <input className={field} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="e.g. singh.cyber" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gov-ink block mb-1">Password</label>
                <input className={field} type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="min 6 characters" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gov-ink block mb-1">Post</label>
                <select className={field} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="investigator">Investigator</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gov-ink block mb-1">Full name</label>
                <input className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Officer name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gov-ink block mb-1">Badge ID</label>
                <input className={field} value={form.badge_id} onChange={e => setForm({ ...form, badge_id: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gov-ink block mb-1">Department</label>
                <input className={field} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
              </div>
            </div>
            <button
              disabled={busy === 'create'}
              onClick={() => act('create', () => adminCreateUser(form),
                `Account ${form.username} created as ${form.role} and active. Share the credentials.`)}
              className="gov-btn disabled:opacity-50"
            >
              <UserPlus size={14} /> {busy === 'create' ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="gov-card p-4">
          <h2 className="text-sm font-bold text-gov-ink mb-3 flex items-center gap-2">
            <ScrollText size={14} /> Audit trail <span className="text-[10px] font-mono text-gov-faint">latest {events.length}</span>
          </h2>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {events.map((e, i) => (
              <div key={i} className="bg-gov-wash rounded-lg px-3 py-2 font-mono text-[11px]">
                <span className="text-gov-faint">{e.ts ? new Date(e.ts).toLocaleString('en-IN') : ''}</span>
                {' · '}<span className="text-gov-navy font-bold">{e.user || e.username || ''}</span>
                {' · '}<span className="text-gov-ink">{e.action || e.query || JSON.stringify(e).slice(0, 120)}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-xs text-gov-faint text-center py-6">No events.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
