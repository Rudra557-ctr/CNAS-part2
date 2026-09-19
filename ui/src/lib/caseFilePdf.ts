import { jsPDF } from 'jspdf'
import type { Lead, Bridge, Burst, Anomaly } from '../types'

// One-click case file: assembles /leads + /why + /bridges + /bursts + /anomalies
// into a court-ready brief. Unlike the dossier export, nothing has to be pinned
// by hand first — this is the "give me the whole case" button.

export interface WhyPayload {
  id: string
  label?: string
  cell?: string
  role?: string
  degree?: number
  top_signals?: string[]
  edge_counts?: Record<string, number>
  sources?: Array<{
    source?: string
    source_type?: string
    day?: number | null
    confidence?: number
    supporting_text?: string
    evidence_hash?: string
    extractor?: string
  }>
}

export interface CaseFileInput {
  caseName: string
  iid?: string
  username: string
  stats: { nodes: number; edges: number }
  leads: Lead[]
  bridges: Bridge[]
  bursts: Burst[]
  anomalies: Anomaly[]
  whys: Record<string, WhyPayload>
}

const clean = (s: unknown) => String(s ?? '—').replace(/\*\*/g, '')
const NAVY: [number, number, number] = [27, 58, 107]

export function exportCaseFilePdf(input: CaseFileInput) {
  const { caseName, iid, username, stats, leads, bridges, bursts, anomalies, whys } = input
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const W = 210, ML = 16, MR = 16, BOTTOM = 276
  const maxW = W - ML - MR
  let y = 20

  const need = (h: number) => {
    if (y + h > BOTTOM) { doc.addPage(); y = 20 }
  }

  const heading = (t: string) => {
    need(16)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY)
    doc.text(t, ML, y)
    doc.setDrawColor(210, 216, 228); doc.line(ML, y + 1.6, W - MR, y + 1.6)
    y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 30)
  }

  const para = (t: string, size = 10, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(size); doc.setTextColor(...color)
    for (const ln of doc.splitTextToSize(clean(t), maxW)) {
      need(6); doc.text(ln, ML, y); y += size <= 8 ? 4.2 : 5.2
    }
    y += 1.5
    doc.setFontSize(10); doc.setTextColor(30, 30, 30)
  }

  const field = (k: string, v: unknown) => {
    need(6)
    const label = `${k}:`
    doc.setFont('helvetica', 'bold')
    doc.text(label, ML, y)
    const labelW = doc.getTextWidth(label)   // measure in bold, before the switch
    doc.setFont('helvetica', 'normal')
    doc.text(clean(v), ML + labelW + 2, y)
    y += 5.2
  }

  // Simple fixed-column table. cols = [{header, width, align?}]
  const table = (
    cols: Array<{ header: string; width: number; align?: 'left' | 'right' }>,
    rows: string[][],
  ) => {
    const header = () => {
      need(9)
      doc.setFillColor(238, 241, 246); doc.rect(ML, y - 4.2, maxW, 6.4, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY)
      let x = ML + 1.5
      cols.forEach(c => {
        doc.text(c.header, c.align === 'right' ? x + c.width - 3 : x, y,
          c.align === 'right' ? { align: 'right' } : undefined)
        x += c.width
      })
      y += 5.4
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
    }
    header()
    rows.forEach((r, i) => {
      if (y + 5.5 > BOTTOM) { doc.addPage(); y = 20; header() }
      if (i % 2 === 1) { doc.setFillColor(249, 250, 252); doc.rect(ML, y - 3.6, maxW, 5.4, 'F') }
      doc.setFontSize(8.5)
      let x = ML + 1.5
      cols.forEach((c, ci) => {
        const txt = doc.splitTextToSize(clean(r[ci]), c.width - 3)[0] ?? ''
        doc.text(txt, c.align === 'right' ? x + c.width - 3 : x, y,
          c.align === 'right' ? { align: 'right' } : undefined)
        x += c.width
      })
      y += 5.4
    })
    y += 3
    doc.setFontSize(10)
  }

  // ── Cover band ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 36, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('CNAS — Automated Case File', ML, 14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`${caseName}${iid ? `  ·  ${iid}` : ''}`, ML, 21)
  doc.setFontSize(8.5); doc.setTextColor(200, 210, 225)
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN')} by ${username} · National Crime Records Bureau`,
    ML, 27.5,
  )
  doc.text('Investigative leads only — not determinations of guilt.', ML, 32.5)
  y = 46
  doc.setTextColor(30, 30, 30)

  // ── 1. Case snapshot ──────────────────────────────────────────────────────
  heading('1.  Case Snapshot')
  field('Entities resolved', stats.nodes)
  field('Relationships mapped', stats.edges)
  field('Priority leads scored', leads.length)
  field('High-priority leads', leads.filter(l => (l.priority || '').toUpperCase() === 'HIGH').length)
  field('Bridge entities flagged', bridges.filter(b => b.flagged !== false).length)
  field('Communication bursts detected', bursts.length)
  field('Active anomalies', anomalies.length)
  y += 2

  // ── 2. Priority suspects ──────────────────────────────────────────────────
  heading('2.  Priority Suspects')
  if (leads.length) {
    table(
      [
        { header: '#', width: 8 },
        { header: 'Entity', width: 52 },
        { header: 'ID', width: 26 },
        { header: 'Cell', width: 20 },
        { header: 'Role', width: 40 },
        { header: 'Score', width: 16, align: 'right' },
        { header: 'Priority', width: 16, align: 'right' },
      ],
      leads.map((l, i) => [
        String(i + 1), l.label || l.entity_id, l.entity_id, l.cell || '—',
        l.role || '—', String(l.lead_score ?? '—'), (l.priority || '—').toUpperCase(),
      ]),
    )
  } else {
    para('No scored leads available for this scope.')
  }

  // ── 3. Evidence basis per suspect (from /why) ─────────────────────────────
  heading('3.  Evidence Basis (why each entity is flagged)')
  const whyIds = Object.keys(whys)
  if (!whyIds.length) para('Evidence detail unavailable — /why did not resolve for the listed entities.')
  whyIds.forEach((id, i) => {
    const w = whys[id]
    need(22)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY)
    doc.text(`3.${i + 1}  ${clean(w.label || id)}  (${id})`, ML, y)
    y += 5.6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 40, 40)
    const ec = w.edge_counts || {}
    para(
      `Cell ${w.cell || '—'} · Role ${w.role || '—'} · Degree ${w.degree ?? '—'} · ` +
      `${ec.CALLED ?? 0} call edges, ${ec.TRANSACTED ?? 0} financial edges, ` +
      `${ec.MENTIONED_IN ?? 0} report mentions (${ec.total ?? 0} total).`,
      9, [70, 70, 70],
    )
    ;(w.top_signals || []).slice(0, 5).forEach(s => {
      need(6)
      doc.setFontSize(9); doc.setTextColor(40, 40, 40)
      for (const ln of doc.splitTextToSize(`•  ${clean(s)}`, maxW - 4)) {
        need(5); doc.text(ln, ML + 3, y); y += 4.4
      }
    })
    const srcs = (w.sources || []).filter(s => s.source).slice(0, 4)
    if (srcs.length) {
      y += 1
      need(8)
      doc.setFontSize(8); doc.setTextColor(110, 110, 110)
      doc.text('Source records (hash-verifiable):', ML + 3, y); y += 4
      srcs.forEach(s => {
        need(4.6)
        const line = `${s.source} · ${s.source_type || 'record'}${s.day != null ? ` · day ${s.day}` : ''}` +
          `${s.confidence != null ? ` · conf ${s.confidence}` : ''}${s.evidence_hash ? ` · ${s.evidence_hash}` : ''}`
        doc.text(doc.splitTextToSize(clean(line), maxW - 8)[0] ?? '', ML + 6, y)
        y += 4.2
      })
    }
    y += 3.5
    doc.setFontSize(10); doc.setTextColor(30, 30, 30)
  })

  // ── 4. Bridge analysis ────────────────────────────────────────────────────
  heading('4.  Bridge Analysis (cross-cell intermediaries)')
  para(
    'Bridge score = 0.6 x normalised betweenness + 0.4 x cross-community edge ratio. ' +
    'Removing a bridge fragments the network faster than removing a high-degree node.',
    9, [70, 70, 70],
  )
  if (bridges.length) {
    table(
      [
        { header: 'Rank', width: 14 },
        { header: 'Entity', width: 62 },
        { header: 'ID', width: 30 },
        { header: 'Cells linked', width: 30 },
        { header: 'Bridge', width: 20, align: 'right' },
        { header: 'Betw.', width: 22, align: 'right' },
      ],
      bridges.map((b, i) => [
        String(b.rank ?? i + 1), b.name || b.id, b.id,
        (b.cells || []).join(', ') || '—',
        (b.bridge_score ?? 0).toFixed(3), (b.betweenness ?? 0).toFixed(3),
      ]),
    )
  } else {
    para('No bridge entities returned for this scope.')
  }

  // ── 5. Temporal bursts ────────────────────────────────────────────────────
  heading('5.  Temporal Bursts & Anomalies')
  if (bursts.length) {
    table(
      [
        { header: 'Cell', width: 30 },
        { header: 'Day', width: 22, align: 'right' },
        { header: 'Events', width: 26, align: 'right' },
        { header: 'z-score', width: 26, align: 'right' },
        { header: 'Window', width: 74 },
      ],
      bursts.slice(0, 20).map(b => [
        b.cell || '—', String(b.day ?? '—'), String(b.count ?? '—'),
        String((b.zscore ?? (b as any).z ?? 0)).slice(0, 6),
        Array.isArray(b.window) ? `days ${b.window.join('–')}` : String(b.window ?? '—'),
      ]),
    )
  } else {
    para('No burst windows crossed the z > 2.0 threshold in this scope.')
  }
  if (anomalies.length) {
    need(10)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    doc.text('Flagged anomalies', ML, y); y += 5
    doc.setFont('helvetica', 'normal')
    table(
      [
        { header: 'Entity', width: 40 },
        { header: 'Type', width: 40 },
        { header: 'Severity', width: 24 },
        { header: 'Detail', width: 74 },
      ],
      anomalies.slice(0, 15).map(a => [
        a.entity_id || '—', a.anomaly_type || '—', (a.severity || '—').toUpperCase(),
        (a as any).explanation || a.description || '—',
      ]),
    )
  }

  // ── 6. Method & thresholds (auditability) ─────────────────────────────────
  heading('6.  Method & Thresholds')
  para(
    'Every figure above is reproducible from the source records cited. Detection thresholds ' +
    'are fixed and published rather than learned, so any result can be re-derived and challenged:',
    9, [70, 70, 70],
  )
  ;[
    'Entity resolution — RapidFuzz name similarity >= 85 AND multi-signal confidence >= 0.65 to merge; 70–85 logged as rejected candidate at confidence 0.5. Devanagari mentions are transliterated before comparison.',
    'Burst detection — rolling z = (count[d] − mean[d−6..d−1]) / std[d−6..d−1]; flagged at z > 2.0. Correlated burst = 2+ cells flagged within a 7-day span.',
    'Structuring — 10+ cash transactions under Rs 50,000 to one receiver within 12 days, plus 2+ consolidations over Rs 2,50,000 within 6 days.',
    'Bridge score — 0.6 x normalised betweenness + 0.4 x cross-community edge ratio.',
    'Community detection — Louvain modularity; label propagation as fallback.',
    'Chain of custody — SHA-256 per evidence record, chained into a Merkle-rooted ledger (Section 63 BSA 2023 / Section 65B IEA).',
  ].forEach(t => {
    need(6)
    doc.setFontSize(8.5); doc.setTextColor(50, 50, 50)
    for (const ln of doc.splitTextToSize(`•  ${t}`, maxW - 4)) {
      need(4.6); doc.text(ln, ML + 3, y); y += 4.2
    }
    y += 1.2
  })

  // ── Footer on every page ──────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5); doc.setTextColor(130, 130, 130)
    doc.text(
      'CNAS automated case file · investigative leads only, not determinations of guilt · values resolved live at export time',
      ML, 288,
    )
    doc.text(`Page ${p} of ${pages}`, W - MR, 288, { align: 'right' })
  }

  doc.save(`CNAS-case-file-${iid || 'demo-graph'}.pdf`)
}
