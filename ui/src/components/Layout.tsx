import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  LayoutDashboard, Network, Map, Clock, Bell,
  Crosshair, FolderOpen, Plug, LogOut, Shield, Share2, Search, ShieldCheck,
  Lightbulb, Layers, MessageSquareText, MicVocal,
} from 'lucide-react'
import GlobalSearch from './GlobalSearch'
import { useLang, LanguageToggle } from '../i18n/LanguageContext'

const NAV = [
  { to: '/',           icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/graph',      icon: Network,          key: 'nav.graph' },
  { to: '/fusion',     icon: Layers,           key: 'nav.fusion' },
  { to: '/map',        icon: Map,              key: 'nav.map' },
  { to: '/timeline',   icon: Clock,            key: 'nav.timeline' },
  { to: '/alerts',     icon: Bell,             key: 'nav.alerts', badge: true },
  { to: '/takedown',   icon: Crosshair,        key: 'nav.takedown' },
  { to: '/explain',    icon: Share2,           key: 'nav.explain' },
  { to: '/search',     icon: Search,           key: 'nav.search' },
  { to: '/ask',        icon: MessageSquareText, key: 'nav.ask' },
  // Reading the case and writing to it are separate jobs with separate risk,
  // so they get separate pages — Ask never writes, Ingest never queries.
  { to: '/ingest',     icon: MicVocal,         key: 'nav.ingest', writeOnly: true },
  { to: '/trust',      icon: ShieldCheck,      key: 'nav.trust' },
  { to: '/key-insights', icon: Lightbulb,   key: 'nav.insights' },
  { to: '/cases',      icon: FolderOpen,       key: 'nav.cases' },
  { to: '/connectors', icon: Plug,             key: 'nav.connectors' },
  { to: '/admin',      icon: ShieldCheck,      key: 'nav.admin', adminOnly: true },
]

export default function Layout() {
  const { username, role, logout } = useAuth()
  const { t } = useLang()
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
          {NAV
            .filter(item => !(item as any).adminOnly || role === 'admin')
            // Ingestion writes to the case record, so analysts (read-only)
            // never see the entry point — the API refuses them anyway.
            .filter(item => !(item as any).writeOnly
                            || role === 'admin' || role === 'investigator')
            .map(({ to, icon: Icon, key, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `gov-nav ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{t(key)}</span>
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
              title={t('nav.signout')}
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
            <LanguageToggle />
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
            {t('common.footer')}
          </p>
        </footer>
      </div>
    </div>
  )
}
