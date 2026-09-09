import { useEffect, useState } from 'react'
import { fetchTemporal } from '../api/client'
import { Clock, TrendingUp, Link2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Burst {
  cell: string
  day: number
  zscore?: number
  z?: number
  count: number
  window?: string
}

interface CorrelatedGroup {
  cells?: string[]
  days?: number[]
  span?: string
  [key: string]: unknown
}

export default function Timeline() {
  const [bursts, setBursts]   = useState<Burst[]>([])
  const [groups, setGroups]   = useState<CorrelatedGroup[]>([])
  const [story,  setStory]    = useState<{ range?: number[] } | null>(null)
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTemporal()
      .then(r => {
        setBursts(r.data.bursts || [])
        setGroups(r.data.correlated_groups || [])
        setStory(r.data.story_slice || null)
        setExplanation(r.data.explanation || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const chart = bursts.map(b => ({
    label: `${b.cell}-D${b.day}`,
    calls: b.count,
    z: b.zscore ?? b.z ?? 0,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Clock size={20} className="text-purple-400" />
          Temporal Analysis
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Communication bursts and multi-cell coordinated activity
          {story?.range ? ` · Story slice: days ${story.range[0]}–${story.range[1]}` : ''}
        </p>
      </div>

      {explanation && (
        <div className="card p-4 border border-purple-500/20">
          <p className="text-xs text-gray-300 leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* Burst volume chart */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-blue-400" />
          Burst Call Volume by Cell / Day
        </h2>
        {chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c2640" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#0f1525', border: '1px solid #243050', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#3b82f6' }}
              />
              <Bar dataKey="calls" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-gray-500 text-center py-8">No burst data available</p>
        )}
      </div>

      {/* Correlated groups */}
      {groups.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Link2 size={14} className="text-cyan-400" />
            Coordinated Multi-Cell Activity ({groups.length})
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {groups.map((g, i) => (
              <div key={i} className="bg-dark-700 rounded-lg p-3 border border-cyan-500/20">
                <p className="text-xs font-mono text-cyan-400">Cells {(g.cells || []).join(' + ')}</p>
                <p className="text-sm font-bold text-white mt-1">{g.span || `Days ${(g.days || []).join(', ')}`}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">≥2 cells spiked within 7 days — possible coordinated operation</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Burst list */}
      {bursts.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white mb-3">Detected Bursts ({bursts.length})</h2>
          <div className="grid grid-cols-4 gap-3">
            {bursts.slice(0, 12).map((b, i) => (
              <div key={i} className="bg-dark-700 rounded-lg p-3 border border-yellow-500/20">
                <p className="text-xs font-mono text-yellow-400">Cell {b.cell} · Day {b.day}</p>
                <p className="text-lg font-bold text-white">{b.count} calls</p>
                <p className="text-[10px] text-gray-500">
                  z-score {(b.zscore ?? b.z ?? 0).toFixed(2)}σ
                  {Array.isArray(b.window) ? ` · days ${b.window[0]}…${b.window[1]}` : b.window ? ` · ${b.window}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
