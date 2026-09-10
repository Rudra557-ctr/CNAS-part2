import { jsPDF } from 'jspdf'

interface LiveBlock {
  id: string
  kind: string
  title?: string
  text?: string
  created_by?: string
  created_at?: string
  changed?: boolean
  missing?: boolean
  entity_id?: string
  src?: string
  dst?: string
  fresh?: Record<string, any>
}

// Clean the **bold** markers the explainer synopsis uses.
const clean = (s: unknown) => String(s || '').replace(/\*\*/g, '')

export function exportDossierPdf(caseName: string, iid: string, username: string, blocks: LiveBlock[]) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const W = 210
  const ML = 16
  const MR = 16
  const maxW = W - ML - MR
  let y = 20

  const need = (h: number) => {
    if (y + h > 280) { doc.addPage(); y = 20 }
  }

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(27, 58, 107)
  doc.rect(0, 0, W, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text('CNAS — Investigation Dossier', ML, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`${caseName}  ·  ${iid}`, ML, 20)
  doc.setFontSize(9); doc.setTextColor(200, 210, 225)
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN')} by ${username} · National Crime Records Bureau`,
    ML, 26,
  )
  y = 42
  doc.setTextColor(30, 30, 30)

  const heading = (t: string) => {
    need(14)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.setTextColor(27, 58, 107)
    doc.text(t, ML, y)
    y += 7
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  }

  const para = (t: string) => {
    const lines = doc.splitTextToSize(clean(t), maxW)
    for (const ln of lines) {
      need(6)
      doc.text(ln, ML, y)
      y += 5.5
    }
    y += 2
  }

  const field = (k: string, v: unknown) => {
    need(6)
    doc.setFont('helvetica', 'bold')
    doc.text(`${k}:`, ML, y)
    doc.setFont('helvetica', 'normal')
    doc.text(clean(v ?? '—'), ML + 4 + doc.getTextWidth(`${k}: `), y)
    y += 5.5
  }

  blocks.forEach((b, i) => {
    heading(`${i + 1}. ${b.title || ({ note: 'Analyst note', entity: 'Entity profile', explainer: 'Connection analysis', stats: 'Case snapshot' } as any)[b.kind] || b.kind}${b.changed ? '  [UPDATED SINCE PINNED]' : ''}`)
    if (b.missing) {
      para('Reference no longer resolves against current data (entity merged or removed). See curation history.')
      return
    }
    if (b.kind === 'note') {
      if (b.text) para(b.text)
    } else if (b.kind === 'stats' && b.fresh) {
      field('Entities', b.fresh.node_count)
      field('Relationships', b.fresh.edge_count)
      y += 2
    } else if (b.kind === 'entity' && b.fresh) {
      field('Entity', `${b.fresh.label}${b.entity_id ? ` (${b.entity_id})` : ''}`)
      field('Cell / Role', `${b.fresh.cell || '—'} / ${b.fresh.role || '—'}`)
      field('Lead score', `${b.fresh.lead_score ?? '—'}${b.fresh.priority ? ` (${b.fresh.priority})` : ''}`)
      y += 2
    } else if (b.kind === 'explainer' && b.fresh) {
      if (b.src && b.dst) field('Pair', `${b.src} ↔ ${b.dst}`)
      field('Assessment', b.fresh.relationship_strength)
      field('Evidence score', b.fresh.evidence_score)
      if (b.fresh.story_synopsis) para(b.fresh.story_synopsis)
    }
    if (b.created_by) {
      doc.setFontSize(8); doc.setTextColor(120, 120, 120)
      need(5)
      doc.text(`Pinned by ${b.created_by}${b.created_at ? ` · ${new Date(b.created_at).toLocaleString('en-IN')}` : ''}`, ML, y)
      y += 6
      doc.setFontSize(10); doc.setTextColor(30, 30, 30)
    }
  })

  // ── Footer disclaimer ───────────────────────────────────────────────────
  need(12)
  doc.setFontSize(8); doc.setTextColor(120, 120, 120)
  doc.text(
    'Investigative leads only — not determinations of guilt. Values resolved live at export time.',
    ML, y,
  )

  doc.save(`CNAS-dossier-${iid}.pdf`)
}
