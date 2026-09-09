import { createContext, useContext, useState, ReactNode } from 'react'

interface AuthCtx { token: string | null; username: string; login: (t: string, u: string) => void; logout: () => void }
const Ctx = createContext<AuthCtx>({ token: null, username: '', login: () => {}, logout: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  // Token is the source of truth in localStorage; the api client attaches it
  // via a request interceptor, so no axios-defaults sync is needed here.
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('token'))
  const [username, setUsername] = useState(localStorage.getItem('username') || '')

  const login = (t: string, u: string) => {
    setToken(t); setUsername(u)
    localStorage.setItem('token', t)
    localStorage.setItem('username', u)
  }

  const logout = () => {
    setToken(null); setUsername('')
    localStorage.removeItem('token'); localStorage.removeItem('username')
  }

  return <Ctx.Provider value={{ token, username, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
