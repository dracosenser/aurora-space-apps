import type { VeilLayout } from '../model/layout'
import type { NodeSnapshot, VeilSnapshot } from '../model/snapshot'

/**
 * Draws the health-signal constellation onto a 2D canvas.
 *
 * The renderer holds no health logic. Every visual state is read from the
 * VeilSnapshot, which is built from Constellation Engine results:
 *
 *   glow size and brightness   |smoothed shift| of the indicator
 *   calm breathing             status "normal"
 *   expanding rings            status "sustained" (faster with larger shift)
 *   a single sharp ping        status "unusual"
 *   a slowly rotating arc      status "drifting" (gradual trend)
 *   dashed grey ring, no glow  status "stale" (no recent data)
 *   dotted hollow ring         status "insufficient-data" (no baseline yet)
 *   ember ring + figure lines  core member of a reported joint pattern
 *   travelling particles       a supported relationship the user has drawn
 *
 * Ambient dust is the only decoration that is not data; it is deliberately
 * small and uniform so it cannot be read as a health event.
 */

export interface SceneInput {
  width: number
  height: number
  dpr: number
  /** Seconds. Hold constant for reduced motion. */
  time: number
  layout: VeilLayout
  snapshot: VeilSnapshot
  selectedId: string | null
  hoverId: string | null
  connection: { a: string; b: string } | null
  drag: { from: string; x: number; y: number; over: string | null } | null
  reducedMotion: boolean
}

const TEXT_STRONG = '#eef3fa'
const TEXT = '#b9c6da'
const MUTED = '#76859e'
const ACCENT = '#4d8dff'
const ACCENT_SOFT = '#7fb2ff'
const EMBER = '#ff7a35'
const SANS = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'
const DUST = 64
const TAU = Math.PI * 2

function fract(v: number): number {
  return v - Math.floor(v)
}

function pseudo(i: number, salt: number): number {
  return fract(Math.sin(i * 127.1 + salt * 311.7) * 43758.5453)
}

interface NodeText {
  name: string
  value: string
}

export class SceneRenderer {
  private bg: HTMLCanvasElement | null = null
  private bgKey = ''
  private sprites = new Map<string, HTMLCanvasElement>()
  private textCache = new Map<string, NodeText>()
  private textSnapshot: VeilSnapshot | null = null
  private textLayout: VeilLayout | null = null
  private figureKey = ''
  private figure: [string, string][] = []
  private readonly spacing: boolean

  constructor() {
    this.spacing = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype
  }

  dispose(): void {
    this.bg = null
    this.sprites.clear()
    this.textCache.clear()
  }

  private sprite(color: string): HTMLCanvasElement {
    let s = this.sprites.get(color)
    if (!s) {
      s = document.createElement('canvas')
      s.width = s.height = 128
      const c = s.getContext('2d')!
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
      g.addColorStop(0, color)
      g.addColorStop(0.18, color + 'cc')
      g.addColorStop(0.45, color + '44')
      g.addColorStop(1, color + '00')
      c.fillStyle = g
      c.fillRect(0, 0, 128, 128)
      this.sprites.set(color, s)
    }
    return s
  }

  /** The static backdrop: deep field, star catalogue, plate grid and the guide ring. */
  private background(width: number, height: number, dpr: number, layout: VeilLayout): HTMLCanvasElement {
    const key = `${width}x${height}@${dpr}`
    if (this.bg && this.bgKey === key) return this.bg
    const bg = document.createElement('canvas')
    bg.width = Math.max(1, Math.round(width * dpr))
    bg.height = Math.max(1, Math.round(height * dpr))
    const c = bg.getContext('2d')!
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    const cx = width / 2
    const cy = height / 2
    const base = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.72)
    base.addColorStop(0, '#0b162c')
    base.addColorStop(0.45, '#060b18')
    base.addColorStop(1, '#02040a')
    c.fillStyle = base
    c.fillRect(0, 0, width, height)

    // Plate grid.
    c.strokeStyle = 'rgba(128, 156, 204, 0.055)'
    c.lineWidth = 1
    c.beginPath()
    const step = 64
    for (let x = cx % step; x < width; x += step) {
      c.moveTo(Math.round(x) + 0.5, 0)
      c.lineTo(Math.round(x) + 0.5, height)
    }
    for (let y = cy % step; y < height; y += step) {
      c.moveTo(0, Math.round(y) + 0.5)
      c.lineTo(width, Math.round(y) + 0.5)
    }
    c.stroke()

    // Deterministic star catalogue.
    const stars = Math.round((width * height) / 5200)
    for (let i = 0; i < stars; i++) {
      const x = pseudo(i, 1) * width
      const y = pseudo(i, 2) * height
      const m = pseudo(i, 3)
      c.globalAlpha = 0.12 + m * m * 0.6
      c.fillStyle = m > 0.92 ? '#cfe0ff' : '#8fa3c8'
      const r = m > 0.95 ? 1.2 : 0.6
      c.beginPath()
      c.arc(x, y, r, 0, TAU)
      c.fill()
    }
    c.globalAlpha = 1

    // The lunar limb below, as seen from orbit: lit from the right, falling to night on the left.
    {
      const rm = width * 1.25
      const mx = cx + width * 0.1
      const my = height * 0.9 + rm
      c.save()
      c.beginPath()
      c.arc(mx, my, rm, 0, TAU)
      c.clip()
      const lit = c.createLinearGradient(0, 0, width, 0)
      lit.addColorStop(0, '#04060b')
      lit.addColorStop(0.35, '#0d1118')
      lit.addColorStop(0.75, '#2a2f38')
      lit.addColorStop(1, '#4a4f58')
      c.fillStyle = lit
      c.fillRect(0, height * 0.82, width, height * 0.2)
      // Craters, foreshortened near the horizon.
      for (let i = 0; i < 46; i++) {
        const px = pseudo(i, 31) * width
        const depth = pseudo(i, 32)
        const py = height * (0.905 + depth * 0.1)
        const r = (3 + pseudo(i, 33) * 16) * (0.5 + depth)
        const light = 0.25 + (px / width) * 0.75
        c.globalAlpha = 0.16 * light
        c.fillStyle = '#000000'
        c.beginPath()
        c.ellipse(px, py, r, r * 0.28, 0, 0, TAU)
        c.fill()
        c.globalAlpha = 0.14 * light
        c.strokeStyle = '#aab2c0'
        c.beginPath()
        c.ellipse(px, py + r * 0.05, r, r * 0.28, 0, 0.1, Math.PI - 0.1)
        c.stroke()
      }
      c.globalAlpha = 1
      const fade = c.createLinearGradient(0, height * 0.86, 0, height)
      fade.addColorStop(0, 'rgba(2,4,10,0)')
      fade.addColorStop(1, 'rgba(2,4,10,0.55)')
      c.fillStyle = fade
      c.fillRect(0, height * 0.82, width, height * 0.2)
      c.restore()
      // Sunlit edge of the limb.
      const edge = c.createLinearGradient(0, 0, width, 0)
      edge.addColorStop(0, 'rgba(180,196,224,0)')
      edge.addColorStop(0.45, 'rgba(180,196,224,0.12)')
      edge.addColorStop(1, 'rgba(226,232,244,0.7)')
      c.strokeStyle = edge
      c.lineWidth = 1.2
      c.beginPath()
      c.arc(mx, my, rm, Math.PI * 1.2, Math.PI * 1.8)
      c.stroke()
    }

    // Guide ring through the category anchors, with graduation ticks.
    if (layout.anchors.length) {
      const rx = layout.rx * width
      const ry = layout.ry * height
      c.strokeStyle = 'rgba(127, 178, 255, 0.11)'
      c.beginPath()
      c.ellipse(cx, cy, rx, ry, 0, 0, TAU)
      c.stroke()
      c.strokeStyle = 'rgba(127, 178, 255, 0.05)'
      c.beginPath()
      c.ellipse(cx, cy, rx * 0.56, ry * 0.56, 0, 0, TAU)
      c.stroke()
      c.strokeStyle = 'rgba(127, 178, 255, 0.2)'
      c.beginPath()
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * TAU
        const len = k % 6 === 0 ? 7 : 3
        const ox = Math.cos(a)
        const oy = Math.sin(a)
        c.moveTo(cx + ox * rx, cy + oy * ry)
        c.lineTo(cx + ox * (rx + len), cy + oy * (ry + len))
      }
      c.stroke()
    }

    // Vignette.
    const vig = c.createRadialGradient(cx, cy, Math.min(width, height) * 0.35, cx, cy, Math.max(width, height) * 0.75)
    vig.addColorStop(0, 'rgba(2,4,10,0)')
    vig.addColorStop(1, 'rgba(2,4,10,0.7)')
    c.fillStyle = vig
    c.fillRect(0, 0, width, height)

    this.bg = bg
    this.bgKey = key
    return bg
  }

  private texts(layout: VeilLayout, snapshot: VeilSnapshot): Map<string, NodeText> {
    if (this.textSnapshot === snapshot && this.textLayout === layout) return this.textCache
    this.textCache.clear()
    for (const n of layout.nodes) {
      const s = snapshot.nodes[n.id]
      let value = ''
      if (!s) value = ''
      else if (s.status === 'insufficient-data') value = 'baseline pending'
      else if (s.status === 'stale') value = `no data since day ${s.lastObservedDay ?? '—'}`
      else if (s.lastValue !== null) {
        value = `${s.lastValue.toFixed(n.decimals)} ${n.unit}`
        if (s.percentChange !== null && Math.abs(s.percentChange) >= 1 && Math.abs(s.percentChange) < 100) {
          value += `  ${s.percentChange > 0 ? '▲' : '▼'}${Math.abs(s.percentChange).toFixed(0)}%`
        }
      }
      this.textCache.set(n.id, { name: n.shortLabel.toUpperCase(), value })
    }
    this.textSnapshot = snapshot
    this.textLayout = layout
    return this.textCache
  }

  /** Minimum spanning tree over the pattern's core members, so the pattern is drawn as a constellation figure. */
  private patternFigure(layout: VeilLayout, ids: readonly string[], width: number, height: number): [string, string][] {
    const key = `${ids.join(',')}|${width}x${height}`
    if (key === this.figureKey) return this.figure
    const nodes = ids.map((id) => layout.nodes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => !!n)
    const edges: [string, string][] = []
    if (nodes.length > 1) {
      const inTree = new Set<string>([nodes[0].id])
      while (inTree.size < nodes.length) {
        let best: [string, string] | null = null
        let bestD = Infinity
        for (const a of nodes) {
          if (!inTree.has(a.id)) continue
          for (const b of nodes) {
            if (inTree.has(b.id)) continue
            const dx = (a.x - b.x) * width
            const dy = (a.y - b.y) * height
            const d = dx * dx + dy * dy
            if (d < bestD) {
              bestD = d
              best = [a.id, b.id]
            }
          }
        }
        if (!best) break
        edges.push(best)
        inTree.add(best[1])
      }
    }
    this.figureKey = key
    this.figure = edges
    return edges
  }

  private setSpacing(ctx: CanvasRenderingContext2D, value: string): void {
    if (this.spacing) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value
  }

  draw(ctx: CanvasRenderingContext2D, input: SceneInput): void {
    const { width, height, dpr, layout, snapshot, time, reducedMotion } = input
    const cx = width / 2
    const cy = height / 2
    const minDim = Math.min(width, height)
    const R = Math.min(15, Math.max(8, minDim * 0.017))
    const compact = width < 560
    const dialR = Math.min(86, Math.max(44, minDim * 0.118))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.background(width, height, dpr, layout), 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ---- Ambient dust (decorative, uniform, slow).
    ctx.fillStyle = '#9db4dc'
    for (let i = 0; i < DUST; i++) {
      const sx = pseudo(i, 11)
      const sy = pseudo(i, 12)
      const vx = (pseudo(i, 13) - 0.5) * 0.006
      const vy = (pseudo(i, 14) - 0.5) * 0.004 - 0.002
      const x = fract(sx + time * vx) * width
      const y = fract(sy + time * vy) * height
      ctx.globalAlpha = 0.1 + pseudo(i, 15) * 0.22
      ctx.fillRect(x, y, 1.2, 1.2)
    }
    ctx.globalAlpha = 1

    // ---- Category spokes and labels.
    ctx.lineWidth = 1
    for (const a of layout.anchors) {
      const ax = a.x * width
      const ay = a.y * height
      ctx.strokeStyle = a.color
      ctx.globalAlpha = 0.14
      ctx.beginPath()
      for (const n of layout.nodes) {
        if (n.categoryId !== a.id) continue
        ctx.moveTo(ax, ay)
        ctx.lineTo(n.x * width, n.y * height)
      }
      ctx.stroke()
      ctx.globalAlpha = 0.5
      ctx.fillStyle = a.color
      ctx.beginPath()
      ctx.moveTo(ax, ay - 3)
      ctx.lineTo(ax + 3, ay)
      ctx.lineTo(ax, ay + 3)
      ctx.lineTo(ax - 3, ay)
      ctx.closePath()
      ctx.fill()
      if (!compact) {
        ctx.globalAlpha = 0.78
        ctx.font = `600 9.5px ${SANS}`
        this.setSpacing(ctx, '0.22em')
        ctx.textAlign = a.align
        ctx.textBaseline = 'middle'
        ctx.fillText(a.label.toUpperCase(), a.labelX * width, a.labelY * height)
      }
    }
    ctx.globalAlpha = 1
    this.setSpacing(ctx, '0px')

    this.drawDial(ctx, input, cx, cy, minDim)

    // ---- Joint-pattern figure: the constellation the engine found.
    const pattern = snapshot.pattern
    if (pattern && pattern.active && pattern.coreMemberIds.length > 1) {
      const edges = this.patternFigure(layout, pattern.coreMemberIds, width, height)
      ctx.lineCap = 'round'
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = EMBER
        ctx.globalAlpha = pass === 0 ? 0.1 : 0.62
        ctx.lineWidth = pass === 0 ? 7 : 1.1
        if (pass === 1) {
          ctx.setLineDash([2, 6])
          ctx.lineDashOffset = reducedMotion ? 0 : -time * 9
        }
        ctx.beginPath()
        for (const [a, b] of edges) {
          const na = layout.nodes.find((n) => n.id === a)!
          const nb = layout.nodes.find((n) => n.id === b)!
          ctx.moveTo(na.x * width, na.y * height)
          ctx.lineTo(nb.x * width, nb.y * height)
        }
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }

    // ---- Relationships the user has drawn.
    for (const link of snapshot.links) {
      const from = layout.nodes.find((n) => n.id === link.leader)
      const to = layout.nodes.find((n) => n.id === link.follower)
      if (!from || !to) continue
      const x0 = from.x * width
      const y0 = from.y * height
      const x1 = to.x * width
      const y1 = to.y * height
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2
      // Bend the curve so it passes around the central dial rather than through it.
      const len = Math.hypot(x1 - x0, y1 - y0) || 1
      const nx = -(y1 - y0) / len
      const ny = (x1 - x0) / len
      const side = (cx - x0) * nx + (cy - y0) * ny
      const clearance = dialR * 1.3 - Math.abs(side)
      const bend = clearance > 0 ? clearance * 2 + 10 : 14
      const dirSign = side >= 0 ? -1 : 1
      const qx = mx + nx * bend * dirSign
      const qy = my + ny * bend * dirSign
      const selected = !!input.connection && ((input.connection.a === link.a && input.connection.b === link.b) || (input.connection.a === link.b && input.connection.b === link.a))
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.quadraticCurveTo(qx, qy, x1, y1)
      if (link.status === 'supported') {
        ctx.strokeStyle = '#a9c7ff'
        ctx.globalAlpha = (selected ? 0.75 : 0.42) + 0.2 * link.strength
        ctx.lineWidth = 1 + 1.5 * link.strength + (selected ? 0.8 : 0)
        ctx.setLineDash([])
      } else if (link.status === 'not-established') {
        ctx.strokeStyle = MUTED
        ctx.globalAlpha = selected ? 0.7 : 0.4
        ctx.lineWidth = 1
        ctx.setLineDash([5, 6])
      } else {
        ctx.strokeStyle = MUTED
        ctx.globalAlpha = selected ? 0.6 : 0.32
        ctx.lineWidth = 1
        ctx.setLineDash([1, 6])
      }
      ctx.stroke()
      ctx.setLineDash([])

      if (link.status === 'supported') {
        // Particles travel from the leading signal to the following one; for a
        // same-day association half travel each way.
        const count = 2 + Math.round(4 * link.strength)
        const white = this.sprite('#ffffff')
        ctx.globalCompositeOperation = 'lighter'
        for (let k = 0; k < count; k++) {
          let t = reducedMotion ? (k + 0.5) / count : fract(time * 0.2 + k / count)
          if (link.lagDays === 0 && k % 2 === 1) t = 1 - t
          const u = 1 - t
          const px = u * u * x0 + 2 * u * t * qx + t * t * x1
          const py = u * u * y0 + 2 * u * t * qy + t * t * y1
          const fade = Math.sin(t * Math.PI)
          ctx.globalAlpha = 0.25 + 0.7 * fade
          const s = 5 + 4 * link.strength
          ctx.drawImage(white, px - s, py - s, s * 2, s * 2)
        }
        ctx.globalCompositeOperation = 'source-over'
      }

      // Midpoint tag.
      const tx = 0.25 * x0 + 0.5 * qx + 0.25 * x1
      const ty = 0.25 * y0 + 0.5 * qy + 0.25 * y1
      const tag =
        link.status === 'supported'
          ? `ρ ${link.rho.toFixed(2).replace('-', '−')}${link.lagDays > 0 ? ` · +${link.lagDays}d` : ' · same day'}`
          : link.status === 'not-established'
            ? 'not established'
            : 'insufficient data'
      ctx.font = `500 9.5px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const tw = ctx.measureText(tag).width + 10
      ctx.globalAlpha = 0.82
      ctx.fillStyle = '#04070f'
      ctx.fillRect(tx - tw / 2, ty - 8, tw, 16)
      ctx.globalAlpha = link.status === 'supported' ? 0.95 : 0.7
      ctx.fillStyle = link.status === 'supported' ? '#cfe0ff' : MUTED
      ctx.fillText(tag, tx, ty + 0.5)
      ctx.globalAlpha = 1
    }

    // ---- Connection being drawn.
    if (input.drag) {
      const from = layout.nodes.find((n) => n.id === input.drag!.from)
      if (from) {
        const target = input.drag.over ? layout.nodes.find((n) => n.id === input.drag!.over) : null
        const ex = target ? target.x * width : input.drag.x
        const ey = target ? target.y * height : input.drag.y
        ctx.strokeStyle = TEXT_STRONG
        ctx.globalAlpha = target ? 0.95 : 0.65
        ctx.lineWidth = 1.4
        ctx.setLineDash([6, 5])
        ctx.lineDashOffset = reducedMotion ? 0 : -time * 30
        ctx.beginPath()
        ctx.moveTo(from.x * width, from.y * height)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.setLineDash([])
        if (target) {
          ctx.globalAlpha = 0.9
          ctx.beginPath()
          ctx.arc(ex, ey, R * 2, 0, TAU)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
    }

    // ---- Signals.
    const texts = this.texts(layout, snapshot)
    for (let i = 0; i < layout.nodes.length; i++) {
      const n = layout.nodes[i]
      const s = snapshot.nodes[n.id]
      if (!s) continue
      this.drawNode(ctx, n.x * width, n.y * height, R, n.color, s, i, time, reducedMotion, input.selectedId === n.id, input.hoverId === n.id || input.drag?.over === n.id)
    }

    // ---- Signal labels.
    for (const n of layout.nodes) {
      const s = snapshot.nodes[n.id]
      const text = texts.get(n.id)
      if (!s || !text) continue
      const px = n.x * width
      const py = n.y * height
      const emphasised = input.selectedId === n.id || input.hoverId === n.id
      const horizontal = Math.abs(n.outX) >= 0.35
      const off = R * 2.5
      let lx = px
      let ly = py
      if (horizontal) {
        lx = px + Math.sign(n.outX) * off
        ctx.textAlign = n.outX > 0 ? 'left' : 'right'
      } else {
        ly = py + Math.sign(n.outY || -1) * (off + 12)
        ctx.textAlign = 'center'
      }
      ctx.textBaseline = 'middle'
      const quiet = s.status === 'insufficient-data' || s.status === 'stale'
      ctx.font = `600 ${compact ? 8.5 : 9.5}px ${SANS}`
      this.setSpacing(ctx, '0.14em')
      ctx.globalAlpha = quiet ? 0.5 : emphasised ? 1 : 0.86
      ctx.fillStyle = emphasised ? TEXT_STRONG : TEXT
      ctx.fillText(text.name, lx, ly - 7)
      this.setSpacing(ctx, '0px')
      if (text.value && (!compact || emphasised)) {
        ctx.font = `500 ${compact ? 9.5 : 10.5}px ${MONO}`
        ctx.fillStyle = s.status === 'sustained' ? '#ffb089' : quiet ? MUTED : emphasised ? TEXT_STRONG : '#a9b8d0'
        ctx.globalAlpha = quiet ? 0.6 : 0.95
        ctx.fillText(text.value, lx, ly + 7)
      }
    }
    ctx.globalAlpha = 1
  }

  private drawDial(ctx: CanvasRenderingContext2D, input: SceneInput, cx: number, cy: number, minDim: number): void {
    const { snapshot, time, reducedMotion } = input
    const r = Math.min(86, Math.max(44, minDim * 0.118))
    const joint = snapshot.joint
    const pattern = snapshot.pattern
    const active = !!pattern && pattern.active

    ctx.fillStyle = '#060b18'
    ctx.globalAlpha = 0.78
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = 'rgba(154, 178, 216, 0.4)'
    ctx.lineWidth = 1
    ctx.stroke()

    if (active) {
      // A slow outward pulse while a joint pattern is being reported.
      const ph = reducedMotion ? 0.4 : fract(time / 3.2)
      ctx.strokeStyle = EMBER
      ctx.globalAlpha = (1 - ph) * 0.5
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, r + 4 + ph * r * 0.55, 0, TAU)
      ctx.stroke()
    }

    const start = Math.PI * 0.75
    const sweep = Math.PI * 1.5
    const arcR = r - 9
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.22
    ctx.strokeStyle = '#9ab2d8'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, arcR, start, start + sweep)
    ctx.stroke()

    // The limit sits at 40% of the sweep, so there is room to show how far beyond it the statistic goes.
    const limitFrac = 0.4
    if (joint) {
      const frac = Math.min(1, (joint.ratio * limitFrac))
      ctx.globalAlpha = 0.95
      ctx.strokeStyle = joint.exceeds ? EMBER : ACCENT
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, arcR, start, start + sweep * Math.max(0.004, frac))
      ctx.stroke()
    }
    const la = start + sweep * limitFrac
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = TEXT_STRONG
    ctx.lineWidth = 1
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(la) * (arcR - 6), cy + Math.sin(la) * (arcR - 6))
    ctx.lineTo(cx + Math.cos(la) * (arcR + 6), cy + Math.sin(la) * (arcR + 6))
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.8
    ctx.fillStyle = MUTED
    ctx.font = `600 ${Math.max(7, r * 0.1)}px ${SANS}`
    this.setSpacing(ctx, '0.2em')
    ctx.fillText('JOINT STATISTIC', cx, cy - r * 0.42)
    this.setSpacing(ctx, '0px')

    ctx.globalAlpha = 1
    if (joint) {
      ctx.fillStyle = joint.exceeds ? '#ffb089' : TEXT_STRONG
      ctx.font = `500 ${r * 0.44}px ${MONO}`
      ctx.fillText(joint.t2.toFixed(0), cx, cy - r * 0.02)
      ctx.fillStyle = MUTED
      ctx.font = `500 ${Math.max(8, r * 0.115)}px ${MONO}`
      ctx.fillText(`limit ${joint.limit.toFixed(1)}`, cx, cy + r * 0.3)
    } else {
      ctx.fillStyle = MUTED
      ctx.font = `500 ${r * 0.3}px ${MONO}`
      ctx.fillText('—', cx, cy - r * 0.02)
      ctx.font = `500 ${Math.max(8, r * 0.115)}px ${MONO}`
      ctx.fillText('baseline period', cx, cy + r * 0.3)
    }

    ctx.font = `600 ${Math.max(7, r * 0.1)}px ${SANS}`
    this.setSpacing(ctx, '0.18em')
    if (active && pattern) {
      ctx.fillStyle = EMBER
      ctx.globalAlpha = 0.95
      ctx.fillText(`PATTERN ${pattern.stage.toUpperCase()}`, cx, cy + r * 0.54)
    } else {
      ctx.fillStyle = joint ? ACCENT_SOFT : MUTED
      ctx.globalAlpha = 0.7
      ctx.fillText(joint ? 'NO JOINT PATTERN' : 'ESTABLISHING', cx, cy + r * 0.54)
    }
    this.setSpacing(ctx, '0px')
    ctx.globalAlpha = 1
  }

  private drawNode(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    R: number,
    color: string,
    s: NodeSnapshot,
    index: number,
    time: number,
    reducedMotion: boolean,
    selected: boolean,
    hovered: boolean,
  ): void {
    const usable = s.status !== 'insufficient-data' && s.status !== 'stale'

    if (usable) {
      // Glow: size and brightness follow the smoothed deviation.
      const breath = reducedMotion ? 1 : 1 + 0.05 * Math.sin(time * 1.1 + index * 1.7)
      const g = R * (2.6 + 4.2 * s.intensity) * breath
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.22 + 0.62 * s.intensity
      ctx.drawImage(this.sprite(color), px - g, py - g, g * 2, g * 2)
      ctx.globalCompositeOperation = 'source-over'
    }

    ctx.lineWidth = 1.5
    if (s.status === 'sustained') {
      const period = 2.8 - 1.3 * s.intensity
      ctx.strokeStyle = color
      for (let k = 0; k < 2; k++) {
        const ph = reducedMotion ? 0.3 + k * 0.4 : fract(time / period + k * 0.5 + index * 0.13)
        ctx.globalAlpha = Math.pow(1 - ph, 1.5) * 0.78
        ctx.beginPath()
        ctx.arc(px, py, R * 1.2 + ph * R * 3.4, 0, TAU)
        ctx.stroke()
      }
    } else if (s.status === 'unusual') {
      const local = reducedMotion ? 0.2 : fract(time / 3 + index * 0.21)
      if (local < 0.5) {
        const ph = local / 0.5
        ctx.strokeStyle = TEXT_STRONG
        ctx.lineWidth = 2
        ctx.globalAlpha = (1 - ph) * 0.9
        ctx.beginPath()
        ctx.arc(px, py, R + ph * R * 2.6, 0, TAU)
        ctx.stroke()
      }
    } else if (s.status === 'drifting') {
      const a = reducedMotion ? index : time * 0.9 + index
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.arc(px, py, R * 1.75, a, a + 2.2)
      ctx.stroke()
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.arc(px, py, R * 1.75, a + Math.PI, a + Math.PI + 1.1)
      ctx.stroke()
    } else if (s.status === 'stale') {
      ctx.strokeStyle = MUTED
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.arc(px, py, R * 1.35, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (s.status === 'insufficient-data') {
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 1
      ctx.setLineDash([1, 4])
      ctx.beginPath()
      ctx.arc(px, py, R * 1.2, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (s.member) {
      // Within its own limit, but shifted enough to count toward a joint pattern.
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.3 + 0.35 * s.intensity
      ctx.beginPath()
      ctx.arc(px, py, R * 1.55, 0, TAU)
      ctx.stroke()
    }

    if (s.inPattern) {
      ctx.strokeStyle = EMBER
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(px, py, R * 1.18, 0, TAU)
      ctx.stroke()
    }

    // Core.
    if (usable) {
      const core = R * (0.5 + 0.22 * s.intensity)
      ctx.globalAlpha = s.observedToday ? 1 : 0.7
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(px, py, core, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(px, py, core * 0.36, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(px, py, R, 0, TAU)
      ctx.stroke()
    } else {
      ctx.strokeStyle = s.status === 'stale' ? MUTED : color
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(px, py, R * 0.55, 0, TAU)
      ctx.stroke()
      if (s.status === 'stale') {
        ctx.beginPath()
        ctx.moveTo(px - R * 0.4, py + R * 0.4)
        ctx.lineTo(px + R * 0.4, py - R * 0.4)
        ctx.stroke()
      }
    }

    if (hovered && !selected) {
      ctx.strokeStyle = TEXT_STRONG
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      ctx.arc(px, py, R * 2, 0, TAU)
      ctx.stroke()
    }
    if (selected) {
      // Registration ticks, as on the plates elsewhere in the interface.
      const h = R * 2.3
      const t = R * 0.8
      ctx.strokeStyle = TEXT_STRONG
      ctx.lineWidth = 1.3
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.moveTo(px + sx * h, py + sy * (h - t))
          ctx.lineTo(px + sx * h, py + sy * h)
          ctx.lineTo(px + sx * (h - t), py + sy * h)
        }
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
