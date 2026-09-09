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
export const searchPeople = (q: string)       => api.get('/people/search', { params: { q } })

// ── Analytics ──────────────────────────────────────────────────────────────
//  /bridges     → array [{id,name,bridge_score,betweenness,flagged,rank,cells}]
//  /bursts      → array [{cell,day,zscore,count,window}]
//  /leads       → {leads: [{entity_id,label,cell,role,lead_score,priority,signals,reasons,explanation}], count}
//  /anomalies   → array [{entity_id,anomaly_type,severity,description,score,…}]
//  /cross-case  → array [{shared_entity,cases,…}]   (hyphenated route)
//  /temporal    → {bursts, correlated_groups, story_slice, narrative_days, explanation}
export const fetchBridges   = (iid?: string)  => api.get('/bridges', { params: iid ? { iid } : {} })
export const fetchBursts    = ()             => api.get('/bursts')
export const fetchLeads     = ()             => api.get('/leads')
export const fetchAnomalies = ()             => api.get('/anomalies')
export const fetchCommunities = ()           => api.get('/communities')
export const fetchCentrality  = ()           => api.get('/centrality')
export const fetchCrossCase   = ()           => api.get('/cross-case')
export const fetchTemporal    = ()           => api.get('/temporal')

// ── Geospatial ─────────────────────────────────────────────────────────────
//  /geospatial/towers       → {towers: [{tower_name,lat,lng,call_count,unique_suspects_count,dominant_cell,…}]}
//  /geospatial/trajectories → {trajectories: [{person_id,person_name,path_coordinates, timeline_events, waypoints_count}]}
//  /geospatial/hotspots     → {hotspots: [{location_name,lat,lng,suspects_count,cells_involved,risk_tier}]}
export const fetchTowers      = ()           => api.get('/geospatial/towers')
export const fetchTrajectories= ()           => api.get('/geospatial/trajectories')
export const fetchHotspots    = ()           => api.get('/geospatial/hotspots')

// ── Takedown ───────────────────────────────────────────────────────────────
//  GET  /takedown/strategies → {strategies: [{id,name,badge,description,target_ids,metrics}], …}
//  POST /takedown/simulate   → {status, targets_count, dismantlement_score_pct,
//                               baseline_efficiency, post_takedown_efficiency,
//                               isolated_fragments_count, severed_channels_count,
//                               recoverable_assets_inr, …}
export const fetchTakedownStrategies = ()    => api.get('/takedown/strategies')
export const simulateTakedown = (target_ids: string[], freeze_accounts = true) =>
  api.post('/takedown/simulate', { target_ids, freeze_accounts })

// ── Connection explainer ───────────────────────────────────────────────────
// Backend: GET /connections/explain?src=X1&dst=X2 → evidence chain between entities
export const explainConnection  = (src: string, dst: string) =>
  api.get('/connections/explain', { params: { src, dst } })

// ── Cases ──────────────────────────────────────────────────────────────────
export const listInvestigations  = ()             => api.get('/investigations')
export const createInvestigation = (name: string, description = '') =>
  api.post('/investigations', { name, description })
export const getInvestigation    = (iid: string) => api.get(`/investigations/${iid}`)
export const deleteInvestigation = (iid: string) => api.delete(`/investigations/${iid}`)
export const processInvestigation = (iid: string) => api.post(`/investigations/${iid}/process`)
export const fetchInvGraph       = (iid: string, day?: number) =>
  api.get(`/investigations/${iid}/graph`, { params: day ? { day } : {} })
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
