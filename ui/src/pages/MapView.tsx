import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import L from 'leaflet'
import { fetchTowers, fetchTrajectories, fetchHotspots, fetchHeatmap } from '../api/client'
import { Map as MapIcon, Navigation, Flame, ThermometerSun } from 'lucide-react'

const INDIA_CENTER: [number, number] = [19.045, 72.855]

interface Tower {
  tower_id: string
  tower_name?: string
  name?: string
  lat: number
  lng: number
  call_count?: number
  unique_suspects_count?: number
  unique_suspects?: string[]
  dominant_cell?: string
  days_active_count?: number
}

interface Trajectory {
  person_id: string
  person_name?: string
  cell?: string
  color?: string
  waypoints_count?: number
  path_coordinates?: [number, number][]
  timeline_events?: Array<{ lat: number; lng: number; location_name?: string; day?: number }>
}

interface Hotspot {
  location_name?: string
  lat: number
  lng: number
  suspects_count?: number
  suspects_list?: string[]
  cells_involved?: string[]
  risk_tier?: string
  total_events?: number
}

function HeatLayer({ points }: { points: number[][] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const layer: any = (L as any).heatLayer(points, { radius: 28, blur: 18, maxZoom: 13, minOpacity: 0.35 })
    layer.addTo(map)
    return () => { map.removeLayer(layer) }
  }, [map, points])
  return null
}

export default function MapView() {
  const [towers,       setTowers]       = useState<Tower[]>([])
  const [trajectories, setTrajectories] = useState<Trajectory[]>([])
  const [hotspots,     setHotspots]     = useState<Hotspot[]>([])
  const [heatPoints,   setHeatPoints]   = useState<number[][]>([])
  const [heatRange,    setHeatRange]    = useState<[number, number]>([1, 90])
  const [windowDays,   setWindowDays]   = useState<[number, number] | null>(null)
  const [layer, setLayer] = useState<'towers'|'trajectories'|'hotspots'|'heatmap'>('towers')

  useEffect(() => {
    fetchTowers()      .then(r => setTowers(r.data.towers        || [])).catch(()=>{})
    fetchTrajectories().then(r => setTrajectories(r.data.trajectories || [])).catch(()=>{})
    fetchHotspots()    .then(r => setHotspots(r.data.hotspots    || [])).catch(()=>{})
    fetchHeatmap()     .then(r => {
      const pts: number[][] = r.data.points || []
      setHeatPoints(pts.map((p: number[]) => [p[0], p[1], p[2]]))
      const dr: [number, number] = r.data.day_range || [1, 90]
      setHeatRange(dr); setWindowDays(dr)
    }).catch(()=>{})
  }, [])

  const filteredTowers = useMemo(() => {
    if (layer !== 'towers' || !windowDays) return towers
    // Towers themselves are not day-filtered on backend; visual stays full-set
    return towers
  }, [towers, layer, windowDays])

  const filteredTrajectories = useMemo(() => {
    if (!windowDays) return trajectories
    const [a, b] = windowDays
    return trajectories.map(tr => ({
      ...tr,
      timeline_events: (tr.timeline_events || []).filter(e => !e.day || (e.day >= a && e.day <= b)),
      path_coordinates: (tr.path_coordinates || []).filter((_, i) => {
        const ev = tr.timeline_events?.[i]
        return !ev?.day || (ev.day >= a && ev.day <= b)
      }),
    })).filter(tr => (tr.timeline_events || tr.path_coordinates || []).length > 1)
  }, [trajectories, windowDays])

  const heatForWindow = useMemo(() => {
    if (!windowDays || !heatPoints.length) return heatPoints
    // heatPoints already windowed if fetched per-window; for now static full-range
    return heatPoints
  }, [heatPoints, windowDays])

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <MapIcon size={20} className="text-orange-400" />
            Geospatial Intelligence
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Cell tower data, suspect trajectories, crime hotspots and call-density heatmap</p>
        </div>
        <div className="flex gap-2">
          {[
            { id: 'towers',       label: `Cell Towers (${towers.length})`,      icon: Navigation, color: 'text-blue-400' },
            { id: 'trajectories', label: `Trajectories (${trajectories.length})`, icon: Navigation, color: 'text-green-400' },
            { id: 'hotspots',     label: `Hotspots (${hotspots.length})`,       icon: Flame,      color: 'text-red-400' },
            { id: 'heatmap',      label: 'Heatmap',                             icon: ThermometerSun, color: 'text-orange-300' },
          ].map(l => (
            <button
              key={l.id}
              onClick={() => setLayer(l.id as typeof layer)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                layer === l.id ? 'bg-dark-600 border-dark-400 text-white' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <l.icon size={12} className={l.color} />
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline scrubber — filters trajectories + heat window */}
      <div className="card p-3 flex items-center gap-4">
        <span className="text-xs font-mono text-gray-500 whitespace-nowrap">Day window</span>
        <input type="range" min={heatRange[0]} max={heatRange[1]} value={windowDays?.[0] ?? heatRange[0]}
          onChange={e => setWindowDays(w => [Number(e.target.value), w?.[1] ?? heatRange[1]])}
          className="flex-1 accent-blue-500" />
        <input type="range" min={heatRange[0]} max={heatRange[1]} value={windowDays?.[1] ?? heatRange[1]}
          onChange={e => setWindowDays(w => [w?.[0] ?? heatRange[0], Number(e.target.value)])}
          className="flex-1 accent-blue-500" />
        <span className="text-xs font-mono text-white bg-dark-700 px-2 py-1 rounded">
          {windowDays ? `${windowDays[0]}–${windowDays[1]}` : `${heatRange[0]}–${heatRange[1]}`}
        </span>
        <button onClick={() => setWindowDays(heatRange)} className="btn-ghost card text-xs py-1">Reset</button>
      </div>

      <div className="flex-1 card overflow-hidden" style={{ height: 'calc(100% - 60px)' }}>
        <MapContainer
          center={INDIA_CENTER}
          zoom={12}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* Cell towers */}
          {layer === 'towers' && filteredTowers.map((t, i) => (
            t.lat && t.lng ? (
              <CircleMarker
                key={t.tower_id || i}
                center={[t.lat, t.lng]}
                radius={8 + Math.min(t.unique_suspects_count || 0, 12)}
                color="#3b82f6" fillColor="#3b82f6" fillOpacity={0.6}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">{t.tower_name || t.name || t.tower_id}</p>
                    <p>Suspects: {t.unique_suspects_count ?? 0} · Calls: {t.call_count ?? 0}</p>
                    <p>Dominant cell: {t.dominant_cell || '—'} · Active days: {t.days_active_count ?? '—'}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ) : null
          ))}

          {/* Trajectories */}
          {layer === 'trajectories' && filteredTrajectories.map((tr, i) => {
            const pts: [number, number][] =
              (tr.path_coordinates && tr.path_coordinates.length > 1)
                ? tr.path_coordinates
                : (tr.timeline_events || []).filter(p => p.lat && p.lng).map(p => [p.lat, p.lng] as [number, number])
            return pts.length > 1 ? (
              <Polyline
                key={tr.person_id || i}
                positions={pts}
                color={tr.color || '#22c55e'}
                weight={2} opacity={0.8}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">{tr.person_name || tr.person_id}</p>
                    <p>{tr.waypoints_count ?? pts.length} sightings · Cell {tr.cell || '—'}</p>
                  </div>
                </Popup>
              </Polyline>
            ) : null
          })}

          {/* Hotspots */}
          {layer === 'hotspots' && hotspots.map((h, i) => (
            h.lat && h.lng ? (
              <CircleMarker
                key={i}
                center={[h.lat, h.lng]}
                radius={12 + Math.min(h.suspects_count || 0, 20)}
                color="#ef4444" fillColor="#ef4444" fillOpacity={0.4}
              >
                <Popup>
                  <div className="text-xs">
                    <p className="font-bold">{h.location_name || 'Hotspot'}</p>
                    <p>{h.risk_tier || ''}</p>
                    <p>Suspects: {h.suspects_count ?? 0} · Cells: {(h.cells_involved || []).join(', ')}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ) : null
          ))}
          {layer === 'heatmap' && <HeatLayer points={heatForWindow} />}
        </MapContainer>
      </div>
    </div>
  )
}
