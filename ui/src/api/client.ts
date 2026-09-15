import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// ── Attach JWT from localStorage to every request ──────────────────────────
// (AuthContext persists the token here on login; interceptor keeps the
//  api instance in sync without import cycles.)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Expired/invalid sessions bounce back to login ──────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      window.location.assign('/login')
    }
    return Promise.reject(err)
  },
)

// ── Auth ───────────────────────────────────────────────────────────────────
// Backend: POST /login with JSON {username, password}
//          → {access_token, username, role, ...}
export const login = (username: string, password: string) =>
  api.post('/login', { username, password })

// ── Graph ──────────────────────────────────────────────────────────────────
export const fetchGraph   = (day?: number)    => api.get('/graph', { params: day ? { day } : {} })
export const fetchWhy     = (id: string)      => api.get(`/why/${id}`)
export const fetchAsk     = (q: string)       => api.get('/ask', { params: { q } })

// ── People search (entity lookup by name / ID / phone / account) ───────────
// Backend: GET /people/search?q=… → {query, results: [{id,name,cell,role,phone,account,photo}], count}
export const searchPeople = (q: string, iid?: string) =>
  api.get('/people/search', { params: { q, ..._iid(iid) } })

// ── Analytics ──────────────────────────────────────────────────────────────
//  /bridges     → array [{id,name,bridge_score,betweenness,flagged,rank,cells}]
//  /bursts      → array [{cell,day,zscore,count,window}]
//  /leads       → {leads: [{entity_id,label,cell,role,lead_score,priority,signals,reasons,explanation}], count}
//  /anomalies   → array [{entity_id,anomaly_type,severity,description,score,…}]
//  /cross-case  → array [{shared_entity,cases,…}]   (hyphenated route)
//  /temporal    → {bursts, correlated_groups, story_slice, narrative_days, explanation}
export const fetchBridges   = (iid?: string)  => api.get('/bridges', { params: iid ? { iid } : {} })
export const fetchBursts    = (iid?: string) => api.get('/bursts', { params: _iid(iid) })
export const fetchLeads     = (iid?: string) => api.get('/leads', { params: _iid(iid) })
export const fetchAnomalies = (iid?: string) => api.get('/anomalies', { params: _iid(iid) })
export const fetchCommunities = (iid?: string) => api.get('/communities', { params: _iid(iid) })
export const fetchCentrality  = (iid?: string) => api.get('/centrality', { params: _iid(iid) })
export const fetchCrossCase   = (iid?: string) => api.get('/cross-case', { params: _iid(iid) })
export const fetchTemporal    = (iid?: string) => api.get('/temporal', { params: _iid(iid) })

// ── Geospatial ─────────────────────────────────────────────────────────────
//  /geospatial/towers       → {towers: [{tower_name,lat,lng,call_count,unique_suspects_count,dominant_cell,…}]}
//  /geospatial/trajectories → {trajectories: [{person_id,person_name,path_coordinates, timeline_events, waypoints_count}]}
//  /geospatial/hotspots     → {hotspots: [{location_name,lat,lng,suspects_count,cells_involved,risk_tier}]}
export const fetchTowers      = (iid?: string) => api.get('/geospatial/towers', { params: _iid(iid) })
export const fetchTrajectories= (p?: { iid?: string }) => api.get('/geospatial/trajectories', { params: p })
export const fetchHotspots    = (iid?: string) => api.get('/geospatial/hotspots', { params: _iid(iid) })
export const fetchHeatmap     = (p?: { day_start?: number; day_end?: number; iid?: string }) =>
  api.get('/geospatial/heatmap', { params: p })

// ── Takedown ───────────────────────────────────────────────────────────────
//  GET  /takedown/strategies → {strategies: [{id,name,badge,description,target_ids,metrics}], …}
//  POST /takedown/simulate   → {status, targets_count, dismantlement_score_pct,
//                               baseline_efficiency, post_takedown_efficiency,
//                               isolated_fragments_count, severed_channels_count,
//                               recoverable_assets_inr, …}
export const fetchTakedownStrategies = (iid?: string) => api.get('/takedown/strategies', { params: _iid(iid) })
export const simulateTakedown = (target_ids: string[], freeze_accounts = true, iid?: string) =>
  api.post('/takedown/simulate', { target_ids, freeze_accounts, ...(iid ? { iid } : {}) })

// ── Analyst curation (Gotham Browser-lite) ─────────────────────────────────
//  PATCH /entity/{id} {field, value} — label/cell/role overrides (CAN_UPLOAD)
//  POST  /entity/merge {keep_id, drop_id} — merge duplicates (CAN_UPLOAD)
//  GET   /entity/{id}/history — curation events (all roles)
//  Optional ?iid= scopes to a case; default is the shared graph.
const _iid = (iid?: string) => (iid ? { iid } : {})
export const patchEntity = (id: string, field: string, value: string, iid?: string) =>
  api.patch(`/entity/${encodeURIComponent(id)}`, { field, value }, { params: _iid(iid) })
export const mergeEntities = (keep_id: string, drop_id: string, iid?: string) =>
  api.post('/entity/merge', { keep_id, drop_id }, { params: _iid(iid) })
export const fetchEntityHistory = (id: string, iid?: string) =>
  api.get(`/entity/${encodeURIComponent(id)}/history`, { params: _iid(iid) })
export const fetchEntityLineage = (id: string, iid?: string) =>
  api.get(`/entity/${encodeURIComponent(id)}/lineage`, { params: _iid(iid) })

// ── Evidence trust (ledger, BSA-63 certificate, hash verifier) ─────────────
export const fetchLedger = (iid?: string) =>
  api.get('/blockchain-ledger', { params: _iid(iid) })
export const fetchCertificate = (iid?: string) =>
  api.get('/chain-of-custody-certificate', { params: _iid(iid) })
export const verifyEvidenceHash = (query: string, iid?: string) =>
  api.post('/verify-evidence-hash', { query, ...(iid ? { iid } : {}) })

// ── Annotations + activity (collaboration-lite) ────────────────────────────
export const fetchAnnotations = (o?: { target_type?: string; target_id?: string; iid?: string }) =>
  api.get('/annotations', { params: o })
export const postAnnotation = (b: { target_type: string; target_id: string; text: string }, iid?: string) =>
  api.post('/annotations', b, { params: _iid(iid) })
export const deleteAnnotation = (cid: string, iid?: string) =>
  api.delete(`/annotations/${cid}`, { params: _iid(iid) })
export const fetchActivity = (iid: string, limit = 50) =>
  api.get(`/investigations/${iid}/activity`, { params: { limit } })

// ── Dossier-lite (per-case live-linked report blocks) ──────────────────────
export const fetchDossier     = (iid: string) => api.get(`/investigations/${iid}/dossier`)
export const fetchLiveDossier = (iid: string) => api.get(`/investigations/${iid}/dossier/live`)
export const pinDossierBlock  = (iid: string, block: object) =>
  api.post(`/investigations/${iid}/dossier/blocks`, block)
export const unpinDossierBlock = (iid: string, bid: string) =>
  api.delete(`/investigations/${iid}/dossier/blocks/${bid}`)

// ── Connection explainer ───────────────────────────────────────────────────
// Backend: GET /connections/explain?src=X1&dst=X2 → evidence chain between entities
export const explainConnection  = (src: string, dst: string, iid?: string) =>
  api.get('/connections/explain', { params: { src, dst, ..._iid(iid) } })

// ── Cases ──────────────────────────────────────────────────────────────────
export const listInvestigations  = ()             => api.get('/investigations')
export const createInvestigation = (name: string, description = '') =>
  api.post('/investigations', { name, description })
export const getInvestigation    = (iid: string) => api.get(`/investigations/${iid}`)
export const deleteInvestigation = (iid: string) => api.delete(`/investigations/${iid}`)
export const processInvestigation = (iid: string) => api.post(`/investigations/${iid}/process`)
export const fetchInvGraph       = (iid: string, day?: number) =>
  api.get(`/investigations/${iid}/graph`, { params: day ? { day } : {} })
export const fetchInvStats       = (iid: string) => api.get(`/investigations/${iid}/stats`)
export const fetchInvLeads       = (iid: string) => api.get(`/investigations/${iid}/leads`)
export const fetchInvWhy         = (iid: string, id: string) => api.get(`/why/${id}`, { params: { iid } })
export const fetchInvCommunities = (iid: string) => api.get('/communities', { params: { iid } })
export const fetchInvDetection   = (iid: string, filename: string) =>
  api.get(`/investigations/${iid}/detection/${encodeURIComponent(filename)}`)

// ── Upload ─────────────────────────────────────────────────────────────────
// Backend: POST /investigations/{iid}/upload with `files: File[]` (multipart)
export const uploadFiles = (investigationId: string, files: File[]) => {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  return api.post(`/investigations/${investigationId}/upload`, form)
}

export default api
