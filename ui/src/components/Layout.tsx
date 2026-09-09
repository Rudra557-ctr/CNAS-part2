import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  LayoutDashboard, Network, Map, Clock, Bell,
  Crosshair, FolderOpen, Plug, LogOut, Shield, Share2,
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
  { to: '/cases',      icon: FolderOpen,       label: 'Cases' },
  { to: '/connectors', icon: Plug,             label: 'Data Connectors' },
]

export default function Layout() {
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-dark-900 overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="w-56 bg-dark-800 border-r border-dark-600 flex flex-col flex-shrink-0">

        {/* Brand */}
        <div className="px-4 py-4 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <Shield size={22} className="text-accent-blue" />
            <div>
              <p className="text-sm font-bold text-white tracking-wide">CNAS</p>
              <p className="text-[10px] text-gray-500 font-mono">v1.0 · NCRB</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-dark-600">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-accent-blue flex items-center justify-center text-xs font-bold">
              {username[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{username}</p>
              <p className="text-[10px] text-gray-500">Operator</p>
            </div>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="h-12 bg-dark-800 border-b border-dark-600 flex items-center px-4 gap-4 flex-shrink-0">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-green-400 font-mono">
              <span className="pulse-dot bg-green-400" />
              LIVE
            </span>
            <span className="text-xs text-gray-500 font-mono">
              {new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
