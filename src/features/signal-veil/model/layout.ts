import type { CategoryDef, IndicatorDef } from '../../../engine/types'

/**
 * Constellation layout. Positions are deterministic and expressed in
 * normalised [0, 1] coordinates so the same layout serves any canvas size.
 */

export const CATEGORY_COLORS: Record<string, string> = {
  cardiovascular: '#ff7a85',
  sleep: '#8ea6ff',
  cognitive: '#6fd3e8',
  activity: '#4fd0a6',
  behavioral: '#ffb84d',
  vitals: '#f075a4',
  environment: '#d9c27a',
  custom: '#c7a2ff',
}

const FALLBACK_COLORS = ['#7aa7ff', '#c7a2ff', '#ff9153', '#4fd6c0', '#aacf63', '#f075a4']

export interface VeilNode {
  id: string
  categoryId: string
  label: string
  shortLabel: string
  unit: string
  decimals: number
  color: string
  x: number
  y: number
  /** Unit vector pointing away from the centre, used to place the label. */
  outX: number
  outY: number
}

export interface VeilAnchor {
  id: string
  label: string
  color: string
  x: number
  y: number
  labelX: number
  labelY: number
  align: 'left' | 'right' | 'center'
}

export interface VeilLayout {
  nodes: VeilNode[]
  anchors: VeilAnchor[]
  aspect: number
  /** Radii of the guide ring through the category anchors (normalised). */
  rx: number
  ry: number
}

export function colorForCategory(id: string, index: number): string {
  return CATEGORY_COLORS[id] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

/** `aspect` is canvas width / height; it keeps clusters round on wide and tall canvases. */
export function buildLayout(indicators: readonly IndicatorDef[], categories: readonly CategoryDef[], aspect = 1.6): VeilLayout {
  const used = categories.filter((c) => indicators.some((i) => i.category === c.id))
  const k = Math.max(1, used.length)
  const cx = 0.5
  const cy = 0.5
  const tall = aspect < 1
  const rx = tall ? 0.3 : 0.31
  const ry = tall ? 0.33 : 0.3
  // Cluster offsets are measured in units of canvas height so they stay round at any aspect.
  const spread = tall ? 0.06 : 0.092
  const nodes: VeilNode[] = []
  const anchors: VeilAnchor[] = []

  used.forEach((cat, ci) => {
    const angle = -Math.PI / 2 + (ci / k) * Math.PI * 2
    const ax = cx + Math.cos(angle) * rx
    const ay = cy + Math.sin(angle) * ry
    const color = colorForCategory(cat.id, ci)
    const members = indicators.filter((i) => i.category === cat.id)
    const m = members.length
    // Outward and tangent directions, corrected so offsets are isotropic in pixels.
    const ox = Math.cos(angle)
    const oy = Math.sin(angle)
    const tx = -oy
    const ty = ox
    members.forEach((ind, mi) => {
      let dx = 0
      let dy = 0
      if (m === 2) {
        const s = mi === 0 ? -1 : 1
        dx = tx * spread * s
        dy = ty * spread * s
      } else if (m > 2) {
        const a = angle + Math.PI + (mi / m) * Math.PI * 2
        dx = Math.cos(a) * spread
        dy = Math.sin(a) * spread
      }
      nodes.push({
        id: ind.id,
        categoryId: cat.id,
        label: ind.label,
        shortLabel: ind.shortLabel,
        unit: ind.unit,
        decimals: ind.decimals,
        color,
        x: ax + dx / aspect,
        y: ay + dy,
        outX: ox,
        outY: oy,
      })
    })
    // Category labels sit above upper clusters and below lower ones, centred on the
    // cluster, so they stay inside a curved visor instead of running off its edge.
    const lx = ax
    const ly = ay + (oy < 0.2 ? -1 : 1) * 0.168
    anchors.push({
      id: cat.id,
      label: cat.label,
      color,
      x: ax,
      y: ay,
      labelX: Math.min(0.9, Math.max(0.1, lx)),
      labelY: Math.min(0.93, Math.max(0.06, ly)),
      align: 'center',
    })
  })
  return { nodes, anchors, aspect, rx, ry }
}

/** Nearest node within `radiusPx` of a pixel position, or null. */
export function hitTestNode(layout: VeilLayout, px: number, py: number, width: number, height: number, radiusPx: number): VeilNode | null {
  let best: VeilNode | null = null
  let bestD = radiusPx * radiusPx
  for (const n of layout.nodes) {
    const dx = n.x * width - px
    const dy = n.y * height - py
    const d = dx * dx + dy * dy
    if (d <= bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

/** Canonical relationship id for a pair, matching the engine's (dataset order). */
export function linkKey(a: string, b: string, order: readonly string[]): string {
  const ia = order.indexOf(a)
  const ib = order.indexOf(b)
  return ia <= ib ? `${a}~${b}` : `${b}~${a}`
}
