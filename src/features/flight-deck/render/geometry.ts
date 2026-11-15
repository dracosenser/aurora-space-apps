import { CUPOLA, ROOMS, STATIONS, inside, type Room } from '../model/deck'

/**
 * The vessel interior, generated from the deck plan.
 *
 * The architectural language is the ISS US segment: a chamfered-octagon
 * cross-section, payload-rack bays filling the side walls, peach structural
 * collars at every hatch, blue handrails running the length of each module,
 * and gridded floor panels over a grated centre run. Nothing is loaded from
 * disk and no texture is sampled; the detail is geometry.
 *
 * Vertex layout, 12 floats:
 *   position xyz | normal xyz | albedo rgb | roughness, metallic, ao
 *
 * Albedo is linear; the shader tonemaps and gamma-encodes. Ambient occlusion
 * is baked per vertex at build time against the deck plan, which is what puts
 * contact darkening into the corners for nothing at runtime.
 */

export const FLOATS_PER_VERTEX = 12

export interface MeshData {
  vertices: Float32Array
  count: number
}

type Rgb = readonly [number, number, number]
/** roughness, metallic, ao */
type Mat = readonly [number, number, number]
type P3 = [number, number, number]

// ------------------------------------------------------------------ palette
// Linear values. sRGB 0.85 is roughly linear 0.70.
const PANEL: Rgb = [0.70, 0.685, 0.645]
const PANEL_2: Rgb = [0.60, 0.59, 0.555]
const PEACH: Rgb = [0.80, 0.40, 0.24]
const PEACH_DK: Rgb = [0.55, 0.26, 0.15]
const ALLOY: Rgb = [0.50, 0.51, 0.53]
const DARKMETAL: Rgb = [0.085, 0.088, 0.098]
const RAIL: Rgb = [0.09, 0.25, 0.45]
const FLOORPAN: Rgb = [0.42, 0.43, 0.44]
const GRATE: Rgb = [0.18, 0.185, 0.195]
const CABLE: Rgb = [0.15, 0.155, 0.165]
const BAG: Rgb = [0.66, 0.645, 0.60]
const BAG_2: Rgb = [0.46, 0.48, 0.52]
const LABEL: Rgb = [0.80, 0.79, 0.75]
const AMBER_L: Rgb = [0.72, 0.44, 0.08]

const M_PANEL: Mat = [0.62, 0.0, 1]
const M_SOFT: Mat = [0.9, 0.0, 1]
const M_METAL: Mat = [0.34, 0.85, 1]
const M_RAIL: Mat = [0.3, 0.55, 1]
const M_FRAME: Mat = [0.3, 0.7, 1]
const M_RUBBER: Mat = [0.95, 0.0, 1]
const M_FLOOR: Mat = [0.55, 0.25, 1]

class Builder {
  readonly v: number[] = []

  get count(): number {
    return this.v.length / FLOATS_PER_VERTEX
  }

  data(): MeshData {
    return { vertices: new Float32Array(this.v), count: this.count }
  }

  tri(a: P3, b: P3, c: P3, col: Rgb, mat: Mat): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    const [r, g, bl] = col
    const [ro, me, ao] = mat
    for (const p of [a, b, c]) this.v.push(p[0], p[1], p[2], nx, ny, nz, r, g, bl, ro, me, ao)
  }

  quad(a: P3, b: P3, c: P3, d: P3, col: Rgb, mat: Mat): void {
    this.tri(a, b, c, col, mat)
    this.tri(a, c, d, col, mat)
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: Rgb, mat: Mat): void {
    const X0 = Math.min(x0, x1), X1 = Math.max(x0, x1)
    const Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1)
    const Z0 = Math.min(z0, z1), Z1 = Math.max(z0, z1)
    this.quad([X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1], col, mat)
    this.quad([X0, Y0, Z1], [X1, Y0, Z1], [X1, Y0, Z0], [X0, Y0, Z0], col, mat)
    this.quad([X0, Y0, Z1], [X0, Y1, Z1], [X1, Y1, Z1], [X1, Y0, Z1], col, mat)
    this.quad([X1, Y0, Z0], [X1, Y1, Z0], [X0, Y1, Z0], [X0, Y0, Z0], col, mat)
    this.quad([X1, Y0, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X1, Y0, Z0], col, mat)
    this.quad([X0, Y0, Z0], [X0, Y1, Z0], [X0, Y1, Z1], [X0, Y0, Z1], col, mat)
  }
}

/** The axis a module runs on. */
export function axisOf(r: Room): 'x' | 'z' {
  return r.along ?? (r.z1 - r.z0 >= r.x1 - r.x0 ? 'z' : 'x')
}

/** Deterministic, so the vessel is identical on every load. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// -------------------------------------------------------------- rack bays
/**
 * One payload-rack bay. ISS rack fronts are flat panels broken by recessed
 * sub-panels, latch pairs, labels and the occasional vent or stowage bag,
 * and that is what gives a module its texture at walking distance.
 *
 * `place(u, h, out)` maps bay-local coordinates into the world: u across the
 * bay, h up it, out toward the viewer.
 */
function rackFace(b: Builder, place: (u: number, h: number, out: number) => P3, bayW: number, bayH: number, seed: number): void {
  const P = place
  const m = 0.05

  // Rack front, then a proud surround so bays read as separate units.
  b.quad(P(m, m, 0), P(m, bayH - m, 0), P(bayW - m, bayH - m, 0), P(bayW - m, m, 0), PANEL, M_PANEL)
  for (const [u0, h0, u1, h1] of [
    [0, 0, bayW, m], [0, bayH - m, bayW, bayH], [0, 0, m, bayH], [bayW - m, 0, bayW, bayH],
  ]) {
    b.quad(P(u0, h0, 0.025), P(u0, h1, 0.025), P(u1, h1, 0.025), P(u1, h0, 0.025), ALLOY, M_METAL)
  }

  // Recessed sub-panels with latches and labels.
  const rows = 3
  const inner = bayH - 0.28
  for (let i = 0; i < rows; i++) {
    const h0 = m + 0.09 + (i * inner) / rows
    const h1 = h0 + inner / rows - 0.08
    const tone = rnd(seed + i) > 0.6 ? PANEL_2 : PANEL
    b.quad(P(m + 0.08, h0, -0.03), P(m + 0.08, h1, -0.03), P(bayW - m - 0.08, h1, -0.03), P(bayW - m - 0.08, h0, -0.03), tone, M_PANEL)
    for (const u of [m + 0.15, bayW - m - 0.15]) {
      b.quad(P(u - 0.03, h0 + 0.035, 0.008), P(u - 0.03, h0 + 0.082, 0.008), P(u + 0.03, h0 + 0.082, 0.008), P(u + 0.03, h0 + 0.035, 0.008), ALLOY, M_METAL)
    }
    if (rnd(seed * 3.1 + i) > 0.42) {
      const lw = 0.15 + rnd(seed + i * 7) * 0.22
      b.quad(P(m + 0.24, h1 - 0.08, 0.006), P(m + 0.24, h1 - 0.032, 0.006), P(m + 0.24 + lw, h1 - 0.032, 0.006), P(m + 0.24 + lw, h1 - 0.08, 0.006), LABEL, M_SOFT)
    }
  }

  // One feature per bay: a vent, a stowage bag, or a caution placard.
  const kind = rnd(seed * 5.7)
  if (kind > 0.72) {
    const vh = 0.34
    const vy = bayH * 0.5 - vh / 2
    const u0 = bayW * 0.5 - 0.22
    const u1 = bayW * 0.5 + 0.22
    b.quad(P(u0, vy, -0.05), P(u0, vy + vh, -0.05), P(u1, vy + vh, -0.05), P(u1, vy, -0.05), GRATE, M_SOFT)
    for (let i = 0; i < 8; i++) {
      const yy = vy + 0.025 + (i * (vh - 0.05)) / 7
      b.quad(P(u0, yy, -0.018), P(u0, yy + 0.013, -0.018), P(u1, yy + 0.013, -0.018), P(u1, yy, -0.018), ALLOY, M_METAL)
    }
  } else if (kind > 0.46) {
    const bw = 0.44, bh = 0.32, dep = 0.19
    const u0 = bayW * 0.5 - bw / 2
    const h0 = bayH * 0.4
    const face = rnd(seed) > 0.5 ? BAG : BAG_2
    b.quad(P(u0, h0, dep), P(u0, h0 + bh, dep), P(u0 + bw, h0 + bh, dep), P(u0 + bw, h0, dep), face, M_SOFT)
    b.quad(P(u0, h0, 0), P(u0, h0, dep), P(u0 + bw, h0, dep), P(u0 + bw, h0, 0), BAG_2, M_SOFT)
    b.quad(P(u0, h0 + bh, dep), P(u0, h0 + bh, 0), P(u0 + bw, h0 + bh, 0), P(u0 + bw, h0 + bh, dep), BAG_2, M_SOFT)
    b.quad(P(u0, h0, 0), P(u0, h0 + bh, 0), P(u0, h0 + bh, dep), P(u0, h0, dep), BAG_2, M_SOFT)
    b.quad(P(u0 + bw, h0, dep), P(u0 + bw, h0 + bh, dep), P(u0 + bw, h0 + bh, 0), P(u0 + bw, h0, 0), BAG_2, M_SOFT)
    for (const t of [0.3, 0.72]) {
      const hh = h0 + bh * t
      b.quad(P(u0 - 0.025, hh, dep + 0.012), P(u0 - 0.025, hh + 0.018, dep + 0.012), P(u0 + bw + 0.025, hh + 0.018, dep + 0.012), P(u0 + bw + 0.025, hh, dep + 0.012), CABLE, M_RUBBER)
    }
  } else if (kind > 0.33) {
    b.quad(P(bayW - 0.32, bayH - 0.32, 0.007), P(bayW - 0.32, bayH - 0.19, 0.007), P(bayW - 0.13, bayH - 0.19, 0.007), P(bayW - 0.13, bayH - 0.32, 0.007), AMBER_L, M_SOFT)
  }
}

// ----------------------------------------------------------- module shell
function moduleShell(b: Builder, r: Room, along: 'x' | 'z'): void {
  const h = r.height
  const c = 0.42
  const a0 = along === 'z' ? r.z0 : r.x0
  const a1 = along === 'z' ? r.z1 : r.x1
  const w0 = along === 'z' ? r.x0 : r.z0
  const w1 = along === 'z' ? r.x1 : r.z1
  const wc = (w0 + w1) / 2

  const W = (t: number, u: number, y: number): P3 => (along === 'z' ? [u, y, t] : [t, y, u])

  const bays = Math.max(2, Math.round((a1 - a0) / 1.08))
  const bayLen = (a1 - a0) / bays

  for (let i = 0; i < bays; i++) {
    const t0 = a0 + i * bayLen
    const t1 = t0 + bayLen
    const mid = (t0 + t1) / 2
    const seed = i * 13.7 + (along === 'z' ? 0 : 91)

    const lo = W(mid, w0 - 0.4, 1)
    const hi = W(mid, w1 + 0.4, 1)
    const openLo = inside(lo[0], lo[2])
    const openHi = inside(hi[0], hi[2])

    // Deck: structural panels with a grated centre run and seam rails.
    b.quad(W(t0, w0 + c, 0), W(t1, w0 + c, 0), W(t1, w1 - c, 0), W(t0, w1 - c, 0), FLOORPAN, M_FLOOR)
    b.quad(W(t0 + 0.05, wc - 0.45, 0.014), W(t1 - 0.05, wc - 0.45, 0.014), W(t1 - 0.05, wc + 0.45, 0.014), W(t0 + 0.05, wc + 0.45, 0.014), GRATE, M_SOFT)
    for (const u of [wc - 0.47, wc + 0.47]) {
      const p0 = W(t0, u - 0.025, 0.014)
      const p1 = W(t1, u + 0.025, 0.035)
      b.box(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], ALLOY, M_METAL)
    }
    const s0 = W(t1 - 0.03, w0 + c, 0.014)
    const s1 = W(t1 + 0.03, w1 - c, 0.032)
    b.box(s0[0], s0[1], s0[2], s1[0], s1[1], s1[2], ALLOY, M_METAL)

    // Deck-head: utility panel, a cable tray and bundles running the length.
    b.quad(W(t0, w1 - c, h), W(t1, w1 - c, h), W(t1, w0 + c, h), W(t0, w0 + c, h), PANEL_2, M_PANEL)
    const c0 = W(t0 + 0.06, wc - 0.32, h - 0.15)
    const c1 = W(t1 - 0.06, wc + 0.32, h - 0.04)
    b.box(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], ALLOY, M_METAL)
    for (const off of [-0.78, -0.66, 0.7, 0.8]) {
      const d0 = W(t0, wc + off - 0.035, h - 0.21)
      const d1 = W(t1, wc + off + 0.035, h - 0.14)
      b.box(d0[0], d0[1], d0[2], d1[0], d1[1], d1[2], CABLE, M_RUBBER)
    }

    // Chamfers, top and bottom, both sides.
    for (const side of [-1, 1] as const) {
      const wEdge = side < 0 ? w0 : w1
      const wIn = side < 0 ? w0 + c : w1 - c
      b.quad(W(t0, wIn, 0), W(t1, wIn, 0), W(t1, wEdge, c), W(t0, wEdge, c), ALLOY, [0.5, 0.4, 1])
      b.quad(W(t0, wEdge, h - c), W(t1, wEdge, h - c), W(t1, wIn, h), W(t0, wIn, h), ALLOY, [0.5, 0.4, 1])
    }

    // Side walls: rack bays, except where the bay is a doorway.
    for (const side of [-1, 1] as const) {
      if (side < 0 ? openLo : openHi) continue
      const wEdge = side < 0 ? w0 : w1
      const place = (u: number, hh: number, out: number): P3 => W(t0 + u, wEdge - side * out, c + hh)
      rackFace(b, place, bayLen, h - 2 * c, seed + (side < 0 ? 0 : 41))
    }
  }

  // End bulkheads. A module's long ends are not covered by the bay loop, so
  // without these you see straight out of the vessel. One is omitted wherever
  // the end opens into another compartment, and the command module's forward
  // end is skipped because the cupola bulkhead is built separately.
  for (const end of [a0, a1] as const) {
    const outward = end === a0 ? -1 : 1
    const probe = W(end + outward * 0.4, wc, 1)
    if (inside(probe[0], probe[2])) continue
    if (r.id === 'command' && end === a1) continue

    // Bulkhead face, then two rack panels on it so it is not a blank wall.
    b.quad(W(end, w0 + c, 0), W(end, w1 - c, 0), W(end, w1 - c, h), W(end, w0 + c, h), PANEL_2, M_PANEL)
    b.quad(W(end, w0, c), W(end, w0 + c, 0), W(end, w0 + c, h), W(end, w0, h - c), ALLOY, [0.5, 0.4, 1])
    b.quad(W(end, w1 - c, 0), W(end, w1, c), W(end, w1, h - c), W(end, w1 - c, h), ALLOY, [0.5, 0.4, 1])

    const panels = Math.max(1, Math.round((w1 - w0 - 2 * c) / 1.1))
    const pw = (w1 - w0 - 2 * c) / panels
    for (let k = 0; k < panels; k++) {
      const u0 = w0 + c + k * pw
      const place = (u: number, hh: number, out: number): P3 => W(end + outward * out, u0 + (outward > 0 ? u : pw - u), c + hh)
      rackFace(b, place, pw, h - 2 * c, 211 + k * 7.3 + (end === a0 ? 0 : 53))
    }
  }

  // Handrails down both sides, with stand-offs.
  for (const side of [-1, 1] as const) {
    const wEdge = (side < 0 ? w0 : w1) - side * 0.16
    for (const y of [0.98, h - 0.78]) {
      const r0 = W(a0 + 0.35, wEdge - 0.03, y - 0.03)
      const r1 = W(a1 - 0.35, wEdge + 0.03, y + 0.03)
      b.box(r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], RAIL, M_RAIL)
      for (const t of [a0 + 0.4, (a0 + a1) / 2, a1 - 0.4]) {
        const m0 = W(t - 0.032, wEdge + side * 0.055, y - 0.032)
        const m1 = W(t + 0.032, wEdge + side * 0.095, y + 0.032)
        b.box(m0[0], m0[1], m0[2], m1[0], m1[1], m1[2], ALLOY, M_METAL)
      }
    }
  }
}

// ----------------------------------------------------------- hatch collar
/** The peach structural surround where two modules meet. */
function hatchCollar(b: Builder, axis: 'x' | 'z', at: number, across0: number, across1: number, h: number): void {
  const cx = (across0 + across1) / 2
  const halfW = Math.min(1.0, (across1 - across0) / 2 - 0.2)
  const y0 = 0.1
  const y1 = Math.min(h - 0.3, 2.2)
  const d = 0.26
  const W = (u: number, y: number, t: number): P3 => (axis === 'z' ? [u, y, t] : [t, y, u])
  const b2 = 0.24

  const segs: [number, number, number, number][] = [
    [cx - halfW - b2, y0 - b2, cx - halfW, y1 + b2],
    [cx + halfW, y0 - b2, cx + halfW + b2, y1 + b2],
    [cx - halfW, y1, cx + halfW, y1 + b2],
    [cx - halfW, y0 - b2, cx + halfW, y0],
  ]
  for (const [u0, v0, u1, v1] of segs) {
    b.quad(W(u0, v0, at - d), W(u0, v1, at - d), W(u1, v1, at - d), W(u1, v0, at - d), PEACH, M_PANEL)
    b.quad(W(u0, v0, at + d), W(u1, v0, at + d), W(u1, v1, at + d), W(u0, v1, at + d), PEACH, M_PANEL)
    // Outer edge of the collar
    b.quad(W(u0, v0, at - d), W(u0, v0, at + d), W(u1, v0, at + d), W(u1, v0, at - d), PEACH_DK, M_PANEL)
  }

  // Throat: the inside faces of the opening.
  for (const u of [cx - halfW, cx + halfW]) {
    b.quad(W(u, y0, at - d), W(u, y1, at - d), W(u, y1, at + d), W(u, y0, at + d), PEACH_DK, M_PANEL)
  }
  b.quad(W(cx - halfW, y1, at - d), W(cx - halfW, y1, at + d), W(cx + halfW, y1, at + d), W(cx + halfW, y1, at - d), PEACH_DK, M_PANEL)

  // Bolt heads around the collar: the detail that sells a pressure fitting.
  const n = 18
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const u = cx + Math.cos(ang) * (halfW + b2 * 0.5)
    const y = (y0 + y1) / 2 + Math.sin(ang) * ((y1 - y0) / 2 + b2 * 0.5)
    for (const o of [at - d - 0.014, at + d + 0.014]) {
      const q0 = W(u - 0.03, y - 0.03, o - 0.014)
      const q1 = W(u + 0.03, y + 0.03, o + 0.014)
      b.box(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], ALLOY, M_METAL)
    }
  }
}

// ---------------------------------------------------------------- cupola
/**
 * The observation structure: one circular pane ringed by six trapezoidal
 * ones, after the ISS cupola. Only the structure is built — the panes are left
 * open so the sky pass shows through, which is what makes the Earth outside a
 * real exterior rather than a picture hung on a wall.
 */
function cupola(b: Builder): void {
  const { x: cx, y: cy, z: cz, radius: R, depth: D } = CUPOLA
  const rIn = R * 0.40
  const rMid = R * 0.55

  const p = (r: number, a: number, z: number): P3 => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]

  // Ring between the centre pane and the six around it.
  const seg = 30
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2
    const a1 = ((i + 1) / seg) * Math.PI * 2
    b.quad(p(rIn, a0, cz), p(rMid, a0, cz), p(rMid, a1, cz), p(rIn, a1, cz), DARKMETAL, M_FRAME)
    // Reveal, so the glass reads as thick
    b.quad(p(rIn, a0, cz), p(rIn, a1, cz), p(rIn, a1, cz + D), p(rIn, a0, cz + D), DARKMETAL, M_FRAME)
    b.quad(p(rMid, a0, cz + D * 0.8), p(rMid, a1, cz + D * 0.8), p(rMid, a1, cz), p(rMid, a0, cz), DARKMETAL, M_FRAME)
  }
  // Bolts around the centre pane
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    const q = p((rIn + rMid) / 2, a, cz - 0.016)
    b.box(q[0] - 0.028, q[1] - 0.028, q[2] - 0.014, q[0] + 0.028, q[1] + 0.028, q[2] + 0.014, ALLOY, M_METAL)
  }

  // Six mullions and the outer rim.
  const gap = 0.07
  for (let k = 0; k < 6; k++) {
    const c1 = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6
    const a0 = (k / 6) * Math.PI * 2 + Math.PI / 6 + gap
    const a1 = c1 - gap
    b.quad(p(rMid, c1 - gap, cz), p(R, c1 - gap, cz), p(R, c1 + gap, cz), p(rMid, c1 + gap, cz), DARKMETAL, M_FRAME)
    b.quad(p(rMid, c1 - gap, cz), p(rMid, c1 + gap, cz), p(rMid, c1 + gap, cz + D * 0.75), p(rMid, c1 - gap, cz + D * 0.75), DARKMETAL, M_FRAME)

    const steps = 6
    for (let i = 0; i < steps; i++) {
      const b0 = a0 + ((a1 - a0) * i) / steps
      const b1 = a0 + ((a1 - a0) * (i + 1)) / steps
      b.quad(p(R, b0, cz), p(R + 0.24, b0, cz), p(R + 0.24, b1, cz), p(R, b1, cz), DARKMETAL, M_FRAME)
      b.quad(p(R, b0, cz), p(R, b1, cz), p(R, b1, cz + D * 0.75), p(R, b0, cz + D * 0.75), DARKMETAL, M_FRAME)
      const q = p(R + 0.12, (b0 + b1) / 2, cz - 0.016)
      b.box(q[0] - 0.028, q[1] - 0.028, q[2] - 0.014, q[0] + 0.028, q[1] + 0.028, q[2] + 0.014, ALLOY, M_METAL)
    }
  }

  // Shutter housings stowed around the outside, and approach handrails.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 3
    const ux = cx + Math.cos(a) * (R + 0.4)
    const uy = cy + Math.sin(a) * (R + 0.4)
    b.box(ux - 0.22, uy - 0.1, cz - 0.34, ux + 0.22, uy + 0.1, cz - 0.08, ALLOY, M_METAL)
  }
  for (const sx of [-1, 1]) {
    b.box(cx + sx * (R + 0.52) - 0.035, cy - 0.95, cz - 0.5, cx + sx * (R + 0.52) + 0.035, cy + 0.95, cz - 0.43, RAIL, M_RAIL)
  }
}

// ------------------------------------------------------------ workstation
/** A console as ISS hardware: a rack panel, a work surface, a screen on an arm. */
function workstation(b: Builder, x: number, z: number, facing: number, width: number): void {
  const c = Math.cos(facing)
  const s = Math.sin(facing)
  const P = (lx: number, ly: number, lz: number): P3 => [x + lx * c + lz * s, ly, z - lx * s + lz * c]
  const hw = width / 2

  // Work surface, edge and legs
  b.quad(P(-hw, 0.76, 0.0), P(-hw, 0.76, 0.56), P(hw, 0.76, 0.56), P(hw, 0.76, 0.0), ALLOY, [0.42, 0.7, 1])
  b.quad(P(-hw, 0.73, 0.0), P(hw, 0.73, 0.0), P(hw, 0.76, 0.0), P(-hw, 0.76, 0.0), ALLOY, M_METAL)
  for (const u of [-hw + 0.14, hw - 0.14]) {
    b.box(...boxPts(P(u - 0.04, 0.0, 0.12), P(u + 0.04, 0.76, 0.2)), ALLOY, M_METAL)
  }
  // Foot restraint on the deck in front of it
  b.quad(P(-0.28, 0.018, -0.46), P(-0.28, 0.018, -0.06), P(0.28, 0.018, -0.06), P(0.28, 0.018, -0.46), GRATE, M_SOFT)
  for (const u of [-0.2, 0.2]) {
    b.box(...boxPts(P(u - 0.03, 0.018, -0.4), P(u + 0.03, 0.07, -0.12)), ALLOY, M_METAL)
  }

  // Equipment stack behind, flush with the rack line
  b.quad(P(-hw, 0.76, 0.54), P(-hw, 1.98, 0.54), P(hw, 1.98, 0.54), P(hw, 0.76, 0.54), PANEL, M_PANEL)
  for (let i = 0; i < 3; i++) {
    const y0 = 0.88 + i * 0.36
    b.quad(P(-hw + 0.09, y0, 0.51), P(-hw + 0.09, y0 + 0.26, 0.51), P(hw - 0.09, y0 + 0.26, 0.51), P(hw - 0.09, y0, 0.51), i === 1 ? PANEL_2 : PANEL, M_PANEL)
    for (const u of [-hw + 0.17, hw - 0.17]) {
      b.quad(P(u - 0.03, y0 + 0.04, 0.545), P(u - 0.03, y0 + 0.09, 0.545), P(u + 0.03, y0 + 0.09, 0.545), P(u + 0.03, y0 + 0.04, 0.545), ALLOY, M_METAL)
    }
  }
  // Arm and display bezel; the lit face comes from buildEmissive.
  b.box(...boxPts(P(-0.05, 1.1, 0.26), P(0.05, 1.18, 0.5)), ALLOY, M_METAL)
  b.quad(P(-0.46, 0.98, 0.2), P(-0.46, 1.62, 0.33), P(0.46, 1.62, 0.33), P(0.46, 0.98, 0.2), DARKMETAL, [0.38, 0.5, 1])
  // Cables dropping from the display into the stack
  b.box(...boxPts(P(0.1, 0.78, 0.44), P(0.14, 1.0, 0.48)), CABLE, M_RUBBER)
}

function boxPts(a: P3, b: P3): [number, number, number, number, number, number] {
  return [a[0], a[1], a[2], b[0], b[1], b[2]]
}

/** The lit surfaces: console screens and deck-head light boxes. */
export function buildEmissive(): MeshData {
  const b = new Builder()
  for (const s of STATIONS) {
    const c = Math.cos(s.facing)
    const sn = Math.sin(s.facing)
    const P = (lx: number, ly: number, lz: number): P3 => [s.x + lx * c + lz * sn, ly, s.z - lx * sn + lz * c]
    b.quad(P(-0.42, 1.01, 0.188), P(-0.42, 1.59, 0.307), P(0.42, 1.59, 0.307), P(0.42, 1.01, 0.188), [0.12, 0.28, 0.38], [1, 0, 1])
  }
  for (const r of ROOMS) {
    const along = axisOf(r)
    const a0 = along === 'z' ? r.z0 : r.x0
    const a1 = along === 'z' ? r.z1 : r.x1
    const cu = along === 'z' ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2
    const n = Math.max(2, Math.round((a1 - a0) / 2.2))
    const y = r.height - 0.155
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * (i + 0.16)) / n
      const t1 = a0 + ((a1 - a0) * (i + 0.84)) / n
      const W = (t: number, u: number): P3 => (along === 'z' ? [u, y, t] : [t, y, u])
      b.quad(W(t0, cu - 0.27), W(t1, cu - 0.27), W(t1, cu + 0.27), W(t0, cu + 0.27), [0.95, 0.93, 0.87], [1, 0, 1])
    }
  }
  return b.data()
}

// -------------------------------------------------------------- assembly
export function buildStructure(): MeshData {
  const b = new Builder()
  for (const r of ROOMS) moduleShell(b, r, axisOf(r))

  const spine = ROOMS[0]
  const cmd = ROOMS[1]
  hatchCollar(b, 'z', spine.z0, spine.x0, spine.x1, spine.height)
  hatchCollar(b, 'z', spine.z1, spine.x0, spine.x1, spine.height)
  for (const r of ROOMS.slice(2)) {
    const at = Math.abs(r.x0 - spine.x1) < 0.01 ? spine.x1 : spine.x0
    hatchCollar(b, 'x', at, r.z0, r.z1, r.height)
  }

  // Forward bulkhead of the command module, with the cupola aperture left open.
  const z = cmd.z1
  const { x: ccx, y: ccy, radius: R } = CUPOLA
  const seg = 28
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2
    const a1 = ((i + 1) / seg) * Math.PI * 2
    const o = R + 0.24
    const clampX = (v: number) => Math.max(cmd.x0, Math.min(cmd.x1, v))
    const clampY = (v: number) => Math.max(0, Math.min(cmd.height, v))
    b.quad(
      [ccx + Math.cos(a0) * o, ccy + Math.sin(a0) * o, z],
      [clampX(ccx + Math.cos(a0) * 16), clampY(ccy + Math.sin(a0) * 16), z],
      [clampX(ccx + Math.cos(a1) * 16), clampY(ccy + Math.sin(a1) * 16), z],
      [ccx + Math.cos(a1) * o, ccy + Math.sin(a1) * o, z],
      PANEL, M_PANEL,
    )
  }
  cupola(b)

  for (const s of STATIONS) workstation(b, s.x, s.z, s.facing, s.width)
  sleepStations(b)

  const mesh = b.data()
  orientFaces(mesh)
  bakeAmbientOcclusion(mesh)
  return mesh
}

/**
 * Turn every face to point into the space a crew member can occupy.
 *
 * The interior is emitted from several wall orientations, caps, collars and
 * fittings, and getting the winding right by hand in every one of them is a
 * bug farm: the first build of this feature silently deleted whole walls that
 * way. Rather than render double-sided, which shades every surface twice, each
 * triangle is tested here against the deck plan. Where one side is walkable
 * and the other is not, the face is made to point at the walkable side,
 * flipping its winding and its normal together. Thin free-standing objects —
 * consoles, handrails, stowage — have open space on both sides, so the test is
 * not decisive and they are left exactly as built.
 *
 * This is not used to enable backface culling: at module junctions both sides
 * are walkable, the test is not decisive there, and culling those faces
 * deletes them. It is kept because the ambient-occlusion bake samples the
 * hemisphere about the stored normal, and a normal pointing into a wall would
 * sample solid structure and darken the whole surface.
 */
function orientFaces(mesh: MeshData): void {
  const v = mesh.vertices
  const S = FLOATS_PER_VERTEX
  let flipped = 0
  for (let t = 0; t < v.length; t += S * 3) {
    const cx = (v[t] + v[t + S] + v[t + 2 * S]) / 3
    const cy = (v[t + 1] + v[t + S + 1] + v[t + 2 * S + 1]) / 3
    const cz = (v[t + 2] + v[t + S + 2] + v[t + 2 * S + 2]) / 3
    const nx = v[t + 3]
    const ny = v[t + 4]
    const nz = v[t + 5]
    const d = 0.16
    const front = cy + ny * d > 0.02 && cy + ny * d < 3.3 && inside(cx + nx * d, cz + nz * d)
    const back = cy - ny * d > 0.02 && cy - ny * d < 3.3 && inside(cx - nx * d, cz - nz * d)
    if (front === back) continue // not decisive: leave it alone
    if (front) continue // already facing the open side
    // Swap two vertices to reverse the winding, and negate the normals.
    for (let k = 0; k < S; k++) {
      const a = t + S + k
      const bb = t + 2 * S + k
      const tmp = v[a]
      v[a] = v[bb]
      v[bb] = tmp
    }
    for (let i = 0; i < 3; i++) {
      v[t + i * S + 3] = -v[t + i * S + 3]
      v[t + i * S + 4] = -v[t + i * S + 4]
      v[t + i * S + 5] = -v[t + i * S + 5]
    }
    flipped++
  }
  if (flipped) console.info(`[flight-deck] oriented ${flipped} faces toward the cabin`)
}

/**
 * Crew sleep stations, after the ISS crew quarters: upright padded racks about
 * the size of a phone box, set into the wall of the crew module with a folded
 * sleeping bag inside and a reading light above. Four of them, one per crew
 * member on the roster.
 */
function sleepStations(b: Builder): void {
  const crew = ROOMS.find((r) => r.id === 'crew')
  if (!crew) return
  const wall = crew.x0 + 0.1
  const W = 0.95
  const D = 0.82
  const H = 2.0
  for (let i = 0; i < 4; i++) {
    const z0 = crew.z0 + 0.7 + i * (W + 0.28)
    const z1 = z0 + W
    // Carcass: back, sides, top, and the lip of the opening.
    b.quad([wall, 0.08, z0], [wall, H, z0], [wall, H, z1], [wall, 0.08, z1], PANEL_2, M_PANEL)
    b.quad([wall, 0.08, z0], [wall + D, 0.08, z0], [wall + D, H, z0], [wall, H, z0], PANEL, M_PANEL)
    b.quad([wall, H, z1], [wall + D, H, z1], [wall + D, 0.08, z1], [wall, 0.08, z1], PANEL, M_PANEL)
    b.quad([wall, H, z0], [wall + D, H, z0], [wall + D, H, z1], [wall, H, z1], PANEL_2, M_PANEL)
    b.box(wall + D - 0.06, 0.08, z0 - 0.05, wall + D + 0.02, H + 0.05, z1 + 0.05, ALLOY, M_METAL)
    // Sleeping bag, strapped upright against the back wall.
    b.box(wall + 0.1, 0.35, z0 + 0.14, wall + 0.42, 1.78, z1 - 0.14, BAG, M_SOFT)
    for (const y of [0.75, 1.35]) {
      b.box(wall + 0.08, y, z0 + 0.1, wall + 0.46, y + 0.025, z1 - 0.1, CABLE, M_RUBBER)
    }
    // Personal stowage below, a reading light and a label above.
    b.box(wall + 0.1, 0.1, z0 + 0.12, wall + 0.55, 0.32, z1 - 0.12, BAG_2, M_SOFT)
    b.box(wall + 0.12, H - 0.16, z0 + 0.3, wall + 0.46, H - 0.1, z1 - 0.3, ALLOY, M_METAL)
    b.quad([wall + D - 0.05, 1.86, z0 + 0.2], [wall + D - 0.05, 1.95, z0 + 0.2], [wall + D - 0.05, 1.95, z0 + 0.62], [wall + D - 0.05, 1.86, z0 + 0.62], LABEL, M_SOFT)
  }
}

/**
 * Per-vertex ambient occlusion, sampled against the deck plan.
 *
 * For each vertex a short fan of rays is fired into the hemisphere about its
 * normal, and each is asked whether it is still in open space a little way
 * out. A vertex in the middle of a rack face sees open volume and stays
 * bright; one tucked into a corner, inside a hatch throat or under a work
 * surface sees structure and darkens. It runs once at startup, costs nothing
 * per frame, and is most of what makes the interior read as lit by a real room
 * rather than by a lamp in a void.
 */
function bakeAmbientOcclusion(mesh: MeshData): void {
  const v = mesh.vertices
  const stride = FLOATS_PER_VERTEX
  const RAYS = 8
  const dirs: P3[] = []
  for (let i = 0; i < RAYS; i++) {
    const t = (i + 0.5) / RAYS
    const phi = Math.acos(1 - t * 0.92)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    dirs.push([Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)])
  }
  const DIST = [0.2, 0.55, 1.2]

  for (let o = 0; o < v.length; o += stride) {
    const px = v[o], py = v[o + 1], pz = v[o + 2]
    const nx = v[o + 3], ny = v[o + 4], nz = v[o + 5]
    const up: P3 = Math.abs(ny) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    let tx = up[1] * nz - up[2] * ny
    let ty = up[2] * nx - up[0] * nz
    let tz = up[0] * ny - up[1] * nx
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl; ty /= tl; tz /= tl
    const bx = ny * tz - nz * ty
    const by = nz * tx - nx * tz
    const bz = nx * ty - ny * tx

    let open = 0
    let total = 0
    for (const [dx, dy, dz] of dirs) {
      const wx = tx * dx + nx * dy + bx * dz
      const wy = ty * dx + ny * dy + by * dz
      const wz = tz * dx + nz * dy + bz * dz
      for (const d of DIST) {
        total++
        const sx = px + wx * d + nx * 0.02
        const sy = py + wy * d + ny * 0.02
        const sz = pz + wz * d + nz * 0.02
        if (sy > 0.03 && sy < 3.2 && inside(sx, sz)) open++
      }
    }
    v[o + 11] *= 0.3 + 0.7 * Math.pow(total ? open / total : 1, 0.8)
  }
}
