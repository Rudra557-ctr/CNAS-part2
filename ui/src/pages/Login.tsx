import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import { login as apiLogin } from '../api/client'
import { useAuth } from '../components/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [user, setUser]   = useState('')
  const [pass, setPass]   = useState('')
  const [show, setShow]   = useState(false)
  const [err,  setErr]    = useState('')
  const [busy, setBusy]   = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const { data } = await apiLogin(user, pass)
      login(data.access_token, data.username || user)
      navigate('/')
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Invalid credentials. Contact your supervisor for an account.')
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
        <form onSubmit={submit} className="gov-card overflow-hidden">
          <div
            className="h-1"
            style={{ background: 'linear-gradient(90deg, #E8762D 0%, #E8762D 33%, #D9DEE7 33%, #D9DEE7 66%, #1E7E46 66%, #1E7E46 100%)' }}
          />
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gov-ink block mb-1.5">Username</label>
              <input
                className="gov-input"
                value={user}
                onChange={e => setUser(e.target.value)}
                placeholder="Official username"
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
                  placeholder="Password"
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
            {err && <p className="text-xs text-gov-red bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
            <button
              type="submit"
              disabled={busy}
              className="gov-btn w-full justify-center py-2.5 disabled:opacity-50"
            >
              {busy ? 'Authenticating…' : 'Sign In'}
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
