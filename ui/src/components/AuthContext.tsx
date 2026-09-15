import { createContext, useContext, useState, ReactNode } from 'react'

export type Role = 'admin' | 'investigator' | 'analyst' | ''

interface AuthCtx {
  token: string | null
  username: string
  role: Role
  login: (t: string, u: string, r: string) => void
  logout: () => void
}
const Ctx = createContext<AuthCtx>({
  token: null, username: '', role: '', login: () => {}, logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  // Token is the source of truth in localStorage; the api client attaches it
  // via a request interceptor, so no axios-defaults sync is needed here.
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('token'))
  const [username, setUsername] = useState(localStorage.getItem('username') || '')
  const [role,     setRole]     = useState<Role>((localStorage.getItem('role') || '') as Role)

  const login = (t: string, u: string, r: string) => {
    setToken(t); setUsername(u); setRole(r as Role)
    localStorage.setItem('token', t)
    localStorage.setItem('username', u)
    localStorage.setItem('role', r)
  }

  const logout = () => {
    setToken(null); setUsername(''); setRole('')
    localStorage.removeItem('token'); localStorage.removeItem('username'); localStorage.removeItem('role')
  }

  return <Ctx.Provider value={{ token, username, role, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** Analysts are strictly read-only: they may view everything but change nothing. */
export const useCanWrite = () => {
  const { role } = useAuth()
  return role === 'admin' || role === 'investigator'
}
