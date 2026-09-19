import { CheckCircle, Lock, Plug } from 'lucide-react'

const ACTIVE = [
  { label: 'CDR Upload (CSV / XLSX)',           detail: 'Auto-detects Jio, Airtel, BSNL, BSNL formats. 100+ column aliases.',       kind: 'file' },
  { label: 'Financial Transactions (CSV)',       detail: 'HDFC, SBI, ICICI, UPI, IMPS, RTGS, NEFT formats supported.',               kind: 'file' },
  { label: 'FIR / Police Reports (PDF / CSV)',   detail: 'OCR-ready. NLP entity extraction on narrative text.',                       kind: 'file' },
  { label: 'Intelligence Reports (CSV)',         detail: 'HUMINT reliability codes A1–F6. Source credibility scoring.',               kind: 'file' },
  { label: 'Surveillance Reports (CSV)',         detail: 'Location + timestamp. Geospatial trajectory reconstruction.',              kind: 'file' },
  { label: 'Social Media Intelligence (CSV)',    detail: 'Handle → entity resolution. Hashtag network analysis.',                    kind: 'file' },
  { label: 'Criminal History DB (CSV / JSON)',   detail: 'Gang affiliation, priors, alias resolution, photo match ready.',           kind: 'file' },
]

const LOCKED = [
  { label: 'CCTNS Live Feed',           detail: 'Crime and Criminal Tracking Network System. Requires MHA authorization.',  agency: 'MHA / State Police' },
  { label: 'TRAI Telecom Gateway',      detail: 'Live CDR stream from all Indian telecom operators. Court order required.', agency: 'TRAI / DoT' },
  { label: 'FIU-IND Financial Feed',    detail: 'Real-time suspicious transaction reports. Requires FIU-IND partner access.', agency: 'FIU-IND / RBI' },
  { label: 'NATGRID Integration',       detail: '21 government databases. Requires NATGRID clearance.',                     agency: 'NATGRID / MHA' },
  { label: 'eCourts Case Feed',         detail: 'Judgment text and case status. Requires MeitY API key.',                   agency: 'MeitY / eCourts' },
  { label: 'NCRB CCTNS Database',       detail: 'National criminal records. Authorized agencies only.',                     agency: 'NCRB / MHA' },
  { label: 'Interpol Red Notice Feed',  detail: 'International fugitive data. INTERPOL NCB India access required.',         agency: 'CBI / INTERPOL NCB' },
]

export default function Connectors() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gov-ink flex items-center gap-2">
          <Plug size={20} className="text-gov-igreen" />
          Data Connectors
        </h1>
        <p className="text-xs text-gov-muted mt-0.5">
          Active data ingestion pipelines and feeds awaiting authorization
        </p>
      </div>

      {/* Active */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle size={14} className="text-gov-igreen" />
          <h2 className="text-sm font-semibold text-gov-ink">Active Connectors</h2>
          <span className="text-xs font-mono bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
            {ACTIVE.length} live
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVE.map((a, i) => (
            <div key={i} className="gov-card p-4 border-green-200 hover:border-green-400 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-gov-igreen animate-pulse flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gov-ink">{a.label}</p>
                  <p className="text-xs text-gov-muted mt-0.5">{a.detail}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-mono bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded">
                  CONNECTED
                </span>
                <span className="text-[10px] text-gov-faint">file upload · auto schema mapping</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Locked */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock size={14} className="text-yellow-600" />
          <h2 className="text-sm font-semibold text-gov-ink">Awaiting Authorization</h2>
          <span className="text-xs font-mono bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">
            {LOCKED.length} pending
          </span>
        </div>
        <p className="text-xs text-gov-muted mb-3">
          These connectors are technically implemented. They require an authorization token from the respective agency.
          Once provided, data flows in automatically with zero code changes.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {LOCKED.map((l, i) => (
            <div key={i} className="gov-card p-4 opacity-80 hover:opacity-100 transition-opacity">
              <div className="flex items-start gap-3">
                <Lock size={14} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gov-ink">{l.label}</p>
                  <p className="text-xs text-gov-muted mt-0.5">{l.detail}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] font-mono bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded">
                  AUTH REQUIRED
                </span>
                <span className="text-[10px] text-gov-faint">{l.agency}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="gov-card p-5 border-blue-200 bg-blue-50/60">
        <h3 className="text-sm font-semibold text-gov-ink mb-2">Ready for Authorized Data</h3>
        <p className="text-xs text-gov-muted leading-relaxed">
          This platform's ingestion layer auto-detects schema from any CSV, XLSX, PDF, or JSON file.
          It supports 100+ column name variations across all major Indian telecom, banking, and police systems.
          The moment an agency provides authorized data access, this system processes real criminal records
          with zero additional development — the analytics, graph, and alerts all function identically
          on real data as they do on the current dataset.
        </p>
      </div>
    </div>
  )
}
