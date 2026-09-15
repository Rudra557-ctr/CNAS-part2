import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'

// Single source of truth for "which case am I looking at?"
// Set when opening a case graph (CaseDetail); cleared from any scope banner.
export function useCaseScope() {
  const [iid, setIid] = useState<string | null>(() => sessionStorage.getItem('caseId'))
  const [caseName] = useState(() => sessionStorage.getItem('caseName') || '')
  const clear = () => {
    sessionStorage.removeItem('caseId')
    sessionStorage.removeItem('caseName')
    setIid(null)
  }
  return { iid: iid || undefined, caseName, scopeKey: iid || '', clear }
}

export function CaseScopeBar({ caseName, caseId, onClear }: { caseName: string; caseId?: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs bg-gov-navy text-white px-3 py-1.5 rounded-lg w-fit">
      <FolderOpen size={12} className="flex-shrink-0" />
      <span className="font-medium truncate max-w-[280px]">
        Case: {caseName || caseId}
      </span>
      <button onClick={onClear} title="Back to global demo data" className="hover:text-gray-300 flex-shrink-0">
        <X size={12} />
      </button>
    </div>
  )
}
