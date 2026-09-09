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
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-700 border border-dark-500 mb-4">
            <Shield size={32} className="text-accent-blue" />
          </div>
          <h1 className="text-xl font-bold text-white">CNAS Platform</h1>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            Criminal Network Analysis System · NCRB
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Username</label>
            <input
              className="input-dark"
              value={user}
              onChange={e => setUser(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Password</label>
            <div className="relative">
              <input
                className="input-dark pr-9"
                type={show ? 'text' : 'password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {err && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full justify-center py-2.5 disabled:opacity-50"
          >
            {busy ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">
          Ministry of Home Affairs · NCRB · Restricted Access
        </p>
      </div>
    </div>
  )
}
