import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth, useCanWrite } from './AuthContext'
import {
  LayoutDashboard, Network, Map, Clock, Bell,
  FolderOpen, Plug, LogOut, Shield, ShieldCheck,
  Lightbulb, ChevronDown, Sparkles, Mic,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import GlobalSearch from './GlobalSearch'
import { useLang, LanguageToggle } from '../i18n/LanguageContext'
import {
  fetchAnomalies, fetchBridges, fetchBursts, fetchCrossCase,
} from '../api/client'

interface NavItem {
  to: string
  icon: any
  key: string
  badge?: boolean
}

// Sidebar carries only navigation. Ask (NLQ) and Dictate (voice entry) live
// in the top action bar; Search is reached through Global Search; Admin
// through the footer shortcut — routes all stay mounted in App.tsx.
const SECTIONS: Array<{ key: string; items: NavItem[] }> = [
  { key: 'nav.sec.workspace', items: [
    { to: '/',      icon: LayoutDashboard, key: 'nav.dashboard' },
    { to: '/cases', icon: FolderOpen,      key: 'nav.cases' },
  ] },
  { key: 'nav.sec.network', items: [
    { to: '/graph',    icon: Network, key: 'nav.graph' },
    { to: '/map',      icon: Map,     key: 'nav.map' },
    { to: '/timeline', icon: Clock,   key: 'nav.timeline' },
  ] },
  { key: 'nav.sec.analytics', items: [
    { to: '/alerts',       icon: Bell,      key: 'nav.alerts', badge: true },
    { to: '/key-insights', icon: Lightbulb, key: 'nav.insights' },
  ] },
  { key: 'nav.sec.governance', items: [
    { to: '/connectors', icon: Plug,        key: 'nav.connectors' },
    { to: '/trust',      icon: ShieldCheck, key: 'nav.trust' },
  ] },
]

const COLLAPSE_KEY = 'cnas-nav-collapsed'
const RAIL_KEY = 'cnas-rail-collapsed'

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')
  } catch { return {} }
}

export default function Layout() {
  const { username, role, logout } = useAuth()
  const canWrite = useCanWrite()
  const { t } = useLang()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) === '1' } catch { return false }
  })
  const [alertCount, setAlertCount] = useState<number | null>(null)

  // Pending-alert pill: total detections across the four alert feeds.
  // Global scope (no case filter), fetched once — failure hides the pill.
  useEffect(() => {
    let live = true
    const safe = (p: Promise<any>) => p.catch(() => null)
    Promise.all([
      safe(fetchAnomalies()), safe(fetchBridges()),
      safe(fetchBursts()), safe(fetchCrossCase()),
    ]).then(([a, b, u, c]) => {
      if (!live) return
      const n = (r: any) =>
        Array.isArray(r?.data) ? r.data.length
        : Array.isArray(r?.data?.anomalies) ? r.data.anomalies.length
        : Array.isArray(r?.data?.bridges) ? r.data.bridges.length
        : Array.isArray(r?.data?.links) ? r.data.links.length
        : 0
      const total = n(a) + n(b) + (Array.isArray(u?.data) ? u.data.length : 0) + n(c)
      setAlertCount(total)
    })
    return () => { live = false }
  }, [])

  const toggle = (key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const toggleRail = () => {
    setRail(prev => {
      try { localStorage.setItem(RAIL_KEY, prev ? '0' : '1') } catch { /* ignore */ }
      return !prev
    })
  }

  return (
    <div className="flex h-screen bg-gov-bg overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className={`${rail ? 'w-[4.25rem]' : 'w-56'} bg-white border-r border-gov-border flex flex-col flex-shrink-0 transition-all`}>
        {/* Tricolor hairline */}
        <div
          className="h-[3px] flex-shrink-0"
          style={{ background: 'linear-gradient(90deg, #E8762D 0%, #E8762D 33%, #E8E8E8 33%, #E8E8E8 66%, #1E7E46 66%, #1E7E46 100%)' }}
        />

        {/* Brand */}
        <div className={`px-4 py-4 border-b border-gov-border ${rail ? 'px-0 flex justify-center' : ''}`}>
          <div className={`flex items-center gap-2.5 ${rail ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-gov-navy flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-white" />
            </div>
            {!rail && (
              <div>
                <p className="text-sm font-bold text-gov-ink tracking-wide leading-tight">CNAS</p>
                <p className="text-[10px] text-gov-muted font-medium leading-tight">
                  Criminal Network Analysis System
                </p>
                <p className="text-[10px] text-gov-faint font-mono leading-tight">NCRB · v1.0</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav — grouped, collapsible; the active route's group never collapses */}
        <nav className={`flex-1 py-2 space-y-1 overflow-y-auto ${rail ? 'px-2' : 'px-2.5'}`}>
          {SECTIONS.map(section => {
            const items = section.items
            const hasActive = items.some(item =>
              item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
            const isCollapsed = collapsed[section.key] && !hasActive
            return (
              <div key={section.key}>
                {!rail && (
                  <button
                    onClick={() => toggle(section.key)}
                    className="w-full flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gov-faint hover:text-gov-muted transition-colors"
                  >
                    <span className="flex-1 text-left">{t(section.key)}</span>
                    <ChevronDown
                      size={12}
                      className={`flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                  </button>
                )}
                {!isCollapsed && (
                  <div className="space-y-1">
                    {items.map(({ to, icon: Icon, key, badge }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        title={rail ? t(key) : undefined}
                        className={({ isActive }) =>
                          `gov-nav ${isActive ? 'active' : ''} ${rail ? 'justify-center px-0' : ''}`
                        }
                      >
                        <Icon size={16} className="flex-shrink-0" />
                        {!rail && <span className="flex-1">{t(key)}</span>}
                        {badge && alertCount != null && alertCount > 0 && (
                          <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-gov-saffron text-white text-[10px] font-bold font-mono flex items-center justify-center flex-shrink-0">
                            {alertCount > 99 ? '99+' : alertCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Rail toggle */}
        <div className={`px-2.5 pb-2 flex-shrink-0 ${rail ? 'px-2' : ''}`}>
          <button
            onClick={toggleRail}
            title={rail ? 'Expand sidebar' : 'Collapse to icons'}
            className={`gov-ghost border border-gov-border w-full text-xs py-1.5 ${rail ? 'justify-center px-0' : ''}`}
          >
            {rail ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            {!rail && <span>Collapse</span>}
          </button>
        </div>

        {/* User footer — pinned to the bottom */}
        <div className={`py-3 border-t border-gov-border flex-shrink-0 ${rail ? 'px-2' : 'px-3'}`}>
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gov-wash ${rail ? 'flex-col justify-center' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-gov-navy flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {username[0]?.toUpperCase() || 'A'}
            </div>
            {!rail && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gov-ink font-semibold truncate">{username}</p>
                <p className="text-[10px] text-gov-muted capitalize">{role || 'Operator'}</p>
              </div>
            )}
            {role === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="text-gov-faint hover:text-gov-navy transition-colors"
                title={t('nav.admin')}
              >
                <ShieldCheck size={15} />
              </button>
            )}
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

        {/* Top bar: search + AI query + voice dictation */}
        <header className="h-14 bg-white border-b border-gov-border flex items-center px-4 gap-3 flex-shrink-0">
          <GlobalSearch />
          <button
            onClick={() => navigate('/ask')}
            title={t('ask.subtitle')}
            className="gov-ghost border border-gov-border text-xs py-1.5 flex-shrink-0"
          >
            <Sparkles size={14} className="text-gov-saffron" />
            <span className="hidden md:inline">{t('header.ask_ai')}</span>
          </button>
          {canWrite && (
            <button
              onClick={() => navigate('/ingest')}
              title={t('header.dictate_title')}
              className="gov-ghost border border-gov-border text-xs py-1.5 flex-shrink-0"
            >
              <Mic size={14} className="text-gov-navy" />
              <span className="hidden md:inline">{t('header.dictate')}</span>
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <LanguageToggle />
            <span className="flex items-center gap-1.5 text-xs text-gov-igreen font-semibold">
              <span className="w-2 h-2 rounded-full bg-gov-igreen animate-pulse" />
              LIVE
            </span>
            <span className="text-xs text-gov-muted font-mono hidden sm:inline">
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
