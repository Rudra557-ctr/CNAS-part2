import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import { login as apiLogin, requestAccess } from '../api/client'
import { useAuth, type Role } from '../components/AuthContext'

const POSTS: { value: Exclude<Role, ''>; label: string }[] = [
  { value: 'investigator', label: 'Investigator' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'admin', label: 'Admin' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [tab, setTab] = useState<'signin' | 'request'>('signin')
  const [user, setUser]   = useState('')
  const [pass, setPass]   = useState('')
  const [post, setPost]   = useState<Exclude<Role, ''>>('investigator')
  const [show, setShow]   = useState(false)
  const [err,  setErr]    = useState('')
  const [busy, setBusy]   = useState(false)
  // request-access form
  const [reqName, setReqName]   = useState('')
  const [reqBadge, setReqBadge] = useState('')
  const [reqDept, setReqDept]   = useState('')
  const [reqJust, setReqJust]   = useState('')
  const [okMsg, setOkMsg] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const { data } = await apiLogin(user, pass, post)
      login(data.access_token, data.username || user, data.role || post)
      navigate('/')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Invalid credentials. Contact your administrator for an account.')
    } finally { setBusy(false) }
  }

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setOkMsg(''); setBusy(true)
    try {
      await requestAccess({
        username: user.trim().toLowerCase(), password: pass, role: post,
        name: reqName.trim(), badge_id: reqBadge.trim(),
        department: reqDept.trim(), justification: reqJust.trim(),
      })
      setOkMsg(`Request submitted for the post of ${post}. The administrator will review it — you can sign in only after approval.`)
      setUser(''); setPass(''); setReqName(''); setReqBadge(''); setReqDept(''); setReqJust('')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Could not submit the request. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gov-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gov-navy shadow-gov mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gov-ink">CNAS Platform</h1>
          <p className="text-xs text-gov-muted mt-1">
            Criminal Network Analysis System
          </p>
          <p className="text-[11px] text-gov-faint font-mono mt-0.5">
            National Crime Records Bureau · Restricted Access
          </p>
        </div>

        {/* Form */}
        <form onSubmit={tab === 'signin' ? submit : submitRequest} className="gov-card overflow-hidden">
          <div
            className="h-1"
            style={{ background: 'linear-gradient(90deg, #E8762D 0%, #E8762D 33%, #D9DEE7 33%, #D9DEE7 66%, #1E7E46 66%, #1E7E46 100%)' }}
          />
          {/* Tabs */}
          <div className="flex border-b border-gov-border">
            {(['signin', 'request'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setErr(''); setOkMsg('') }}
                className={`flex-1 px-4 py-2.5 text-xs font-bold tracking-wide uppercase transition-colors ${
                  tab === t ? 'text-gov-navy border-b-2 border-gov-navy -mb-px' : 'text-gov-faint hover:text-gov-ink'
                }`}
              >
                {t === 'signin' ? 'Sign in' : 'Request access'}
              </button>
            ))}
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gov-ink block mb-1.5">User ID</label>
              <input
                className="gov-input"
                value={user}
                onChange={e => setUser(e.target.value)}
                placeholder="Official user ID"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gov-ink block mb-1.5">Password</label>
              <div className="relative">
                <input
                  className="gov-input pr-9"
                  type={show ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder={tab === 'signin' ? 'Password' : 'Choose a password (min 6 characters)'}
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gov-faint hover:text-gov-ink"
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gov-ink block mb-1.5">
                Post {tab === 'request' && <span className="font-normal text-gov-muted">(applied for)</span>}
              </label>
              <select className="gov-input" value={post} onChange={e => setPost(e.target.value as Exclude<Role, ''>)} required>
                {POSTS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {tab === 'signin' && (
                <p className="text-[11px] text-gov-faint mt-1">Must match the post on your account, else sign-in is refused.</p>
              )}
            </div>
            {tab === 'request' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-gov-ink block mb-1.5">Full name</label>
                  <input className="gov-input" value={reqName} onChange={e => setReqName(e.target.value)} placeholder="e.g. Inspector Priya Sharma" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gov-ink block mb-1.5">Badge ID</label>
                    <input className="gov-input" value={reqBadge} onChange={e => setReqBadge(e.target.value)} placeholder="e.g. DL-CYBER-8842" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gov-ink block mb-1.5">Department</label>
                    <input className="gov-input" value={reqDept} onChange={e => setReqDept(e.target.value)} placeholder="e.g. Cyber Cell" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gov-ink block mb-1.5">Why do you need access?</label>
                  <textarea className="gov-input" rows={2} value={reqJust} onChange={e => setReqJust(e.target.value)} placeholder="Posting details, case assignment…" />
                </div>
              </>
            )}
            {err && <p className="text-xs text-gov-red bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            {okMsg && <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{okMsg}</p>}
            <button
              type="submit"
              disabled={busy}
              className="gov-btn w-full justify-center py-2.5 disabled:opacity-50"
            >
              {busy ? (tab === 'signin' ? 'Authenticating…' : 'Submitting…') : (tab === 'signin' ? 'Sign In' : 'Submit access request')}
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-gov-faint mt-4">
          Ministry of Home Affairs · All actions are audit-logged
        </p>
      </div>
    </div>
  )
}
