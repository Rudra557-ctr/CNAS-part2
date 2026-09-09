// ── Graph types ────────────────────────────────────────────────────────────
export type NodeKind = 'Person' | 'Phone' | 'Account' | 'Location' | 'Vehicle' | 'Organization'

export interface GraphNode {
  id: string
  label: string
  kind: NodeKind
  cell?: string
  role?: string
  score?: number
  risk_score?: number
  lat?: number
  lng?: number
  analyst_edited?: boolean
  analyst_override?: Record<string, { by: string; at: string }>
}

export interface GraphEdge {
  src: string
  dst: string
  kind: string
  source?: string
  source_type?: string
  confidence?: number
  day?: number | null
  supporting_text?: string
  evidence_hash?: string
  extractor?: string
  meta?: Record<string, unknown>
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: { node_count: number; edge_count: number }
}

// ── Analytics ──────────────────────────────────────────────────────────────
export interface Lead {
  entity_id: string
  entity_type?: string
  label: string
  cell?: string
  role?: string
  lead_score: number
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  signals?: Record<string, number | boolean>
  reasons?: string[]
  explanation?: string
}

export interface Bridge {
  id: string
  name: string
  bridge_score: number
  betweenness: number
  flagged: boolean
  rank: number
  cells?: string[]
}

export interface Burst {
  cell: string
  day: number
  zscore?: number
  z?: number
  count: number
  window?: string | number[]
}

export interface Community {
  community_id: number | string
  size: number
  dominant_cell?: string
  members: string[]
  cell_breakdown?: Record<string, number>
}

export interface Anomaly {
  entity_id: string
  entity_name?: string
  anomaly_type: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  day?: number
  score?: number
}

export interface TowerData {
  tower_id: string
  location: string
  lat: number
  lng: number
  suspect_count: number
  activity_days: number[]
}

export interface Trajectory {
  person_id: string
  person_name: string
  path: Array<{ lat: number; lng: number; location: string; day: number }>
}

export interface TakedownStrategy {
  id: string
  name: string
  badge?: string
  badge_color?: string
  description: string
  target_ids: string[]
  metrics?: {
    dismantlement_score_pct?: number
    [key: string]: unknown
  }
}

export interface TakedownResult {
  status: string
  targets_count: number
  dismantlement_score_pct: number
  baseline_efficiency: number
  post_takedown_efficiency: number
  isolated_fragments_count: number
  severed_channels_count: number
  recoverable_assets_inr: number
  frozen_transactions_count?: number
  frozen_accounts_count?: number
  succession_risk?: unknown
  target_profiles?: Array<{ id?: string; name?: string; [key: string]: unknown }>
  tactical_resource_allocation?: Record<string, number>
}

// ── Auth ───────────────────────────────────────────────────────────────────
export interface User {
  username: string
  role: string
  token: string
}
