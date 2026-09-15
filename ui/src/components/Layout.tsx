import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  LayoutDashboard, Network, Map, Clock, Bell,
  Crosshair, FolderOpen, Plug, LogOut, Shield, Share2, Search, ShieldCheck,
  Lightbulb,
} from 'lucide-react'
import GlobalSearch from './GlobalSearch'

const NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/graph',      icon: Network,          label: 'Network Graph' },
  { to: '/map',        icon: Map,              label: 'Map View' },
  { to: '/timeline',   icon: Clock,            label: 'Timeline' },
  { to: '/alerts',     icon: Bell,             label: 'Alerts',    badge: true },
  { to: '/takedown',   icon: Crosshair,        label: 'Takedown Sim' },
  { to: '/explain',    icon: Share2,           label: 'Why Connected' },
  { to: '/search',     icon: Search,           label: 'Search All' },
  { to: '/trust',      icon: ShieldCheck,      label: 'Evidence Trust' },
  { to: '/key-insights', icon: Lightbulb,   label: 'Key Insights' },
  { to: '/cases',      icon: FolderOpen,       label: 'Cases' },
  { to: '/connectors', icon: Plug,             label: 'Data Connectors' },
  { to: '/admin',      icon: ShieldCheck,      label: 'Administration', adminOnly: true },
]

export default function Layout() {
  const { username, role, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-gov-bg overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="w-60 bg-white border-r border-gov-border flex flex-col flex-shrink-0">
        {/* Tricolor hairline */}
        <div
          className="h-[3px] flex-shrink-0"
          style={{ background: 'linear-gradient(90deg, #E8762D 0%, #E8762D 33%, #E8E8E8 33%, #E8E8E8 66%, #1E7E46 66%, #1E7E46 100%)' }}
        />

        {/* Brand */}
        <div className="px-4 py-4 border-b border-gov-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gov-navy flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gov-ink tracking-wide leading-tight">CNAS</p>
              <p className="text-[10px] text-gov-muted font-medium leading-tight">
                Criminal Network Analysis System
              </p>
              <p className="text-[10px] text-gov-faint font-mono leading-tight">NCRB · v1.0</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {NAV.filter(item => !(item as any).adminOnly || role === 'admin').map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `gov-nav ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="w-2 h-2 rounded-full bg-gov-saffron animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-gov-border">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gov-wash">
            <div className="w-7 h-7 rounded-full bg-gov-navy flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {username[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gov-ink font-semibold truncate">{username}</p>
              <p className="text-[10px] text-gov-muted capitalize">{role || 'Operator'}</p>
            </div>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="text-gov-faint hover:text-gov-red transition-colors"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gov-border flex items-center px-4 gap-4 flex-shrink-0">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-gov-igreen font-semibold">
              <span className="w-2 h-2 rounded-full bg-gov-igreen animate-pulse" />
              LIVE
            </span>
            <span className="text-xs text-gov-muted font-mono">
              {new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>

        {/* Footer strip */}
        <footer className="flex-shrink-0 border-t border-gov-border bg-white px-4 py-1.5">
          <p className="text-[10px] text-gov-faint text-center font-medium">
            CNAS · National Crime Records Bureau · Restricted access — all actions are audit-logged
          </p>
        </footer>
      </div>
    </div>
  )
}
