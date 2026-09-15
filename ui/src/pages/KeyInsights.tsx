import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wallet, Phone, FileText, Lightbulb } from 'lucide-react'
import { CaseScopeBar } from '../components/CaseScope'
import Finance from './Finance'
import Communications from './Communications'
import Evidence from './Evidence'

const TABS = [
  { id: 'finance', label: 'Finance', icon: Wallet, hint: 'Every financial transaction in the case' },
  { id: 'communications', label: 'Communications', icon: Phone, hint: 'Every call record captured in the case' },
  { id: 'evidence', label: 'Evidence', icon: FileText, hint: 'Everything found in the case so far' },
] as const

type TabId = (typeof TABS)[number]['id']

const isTab = (v: string | null): v is TabId =>
  v === 'finance' || v === 'communications' || v === 'evidence'

export default function KeyInsights() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<TabId>(() => (isTab(params.get('tab')) ? (params.get('tab') as TabId) : 'finance'))
  const [scopeBump, setScopeBump] = useState(0)
  const caseId = sessionStorage.getItem('caseId')
  const caseName = sessionStorage.getItem('caseName') || ''

  useEffect(() => {
    const t = params.get('tab')
    if (isTab(t) && t !== tab) setTab(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const select = (id: TabId) => {
    setTab(id)
    setParams({ tab: id }, { replace: true })
  }

  const handleClearScope = () => {
    sessionStorage.removeItem('caseId')
    sessionStorage.removeItem('caseName')
    setScopeBump(b => b + 1) // force tab content to remount with cleared scope
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-gov-ink flex items-center gap-2">
          <Lightbulb size={20} className="text-gov-saffron" /> Key Insights
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">The case parameters that matter most — money, calls and evidence.</p>
        {caseId && (
          <div className="mt-2">
            <CaseScopeBar caseName={caseName} caseId={caseId} onClear={handleClearScope} />
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Key insight sections">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => select(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all ${
              tab === t.id
                ? 'bg-gov-navy border-gov-navy text-white font-semibold'
                : 'bg-white border-gov-border text-gov-muted hover:text-gov-ink hover:border-gov-navy'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      <div key={`${tab}-${scopeBump}-${caseId || 'global'}`}>
        {tab === 'finance' && <Finance embedded />}
        {tab === 'communications' && <Communications embedded />}
        {tab === 'evidence' && <Evidence embedded />}
      </div>
    </div>
  )
}
