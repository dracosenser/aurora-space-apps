import { CUPOLA, DOORS, ROOMS, STATIONS, inside, type Room } from '../model/deck'
import { FIXTURES, FIXTURE_RANGE2, attenuation } from './fixtures'
import {
  airlockChamber, auxComputers, cableRuns, commandArea, evaPrepRoom, exerciseStation,
  galley, hatchLeaf, hatchSurround,
} from './outfitting'

/**
 * The vessel interior, generated from the deck plan.
 *
 * The architectural language is the ISS US segment: a chamfered-octagon
 * cross-section, payload-rack bays filling the side walls, peach structural
 * collars at every hatch, blue handrails running the length of each module,
 * and gridded floor panels over a grated centre run. Nothing is loaded from
 * disk and no texture is sampled; the detail is geometry.
 *
 * Vertex layout, 15 floats:
 *   position xyz | normal xyz | albedo rgb | roughness, metallic, ao | irradiance rgb
 *
 * Albedo is linear; the shader tonemaps and gamma-encodes. Ambient occlusion
 * and the diffuse irradiance from every interior fixture are both baked per
 * vertex at build time against the deck plan, which is what puts contact
 * darkening into the corners and light into the rooms for nothing per frame.
 */

export const FLOATS_PER_VERTEX = 15

export interface MeshData {
  vertices: Float32Array
  count: number
}

export type Rgb = readonly [number, number, number]
/** roughness, metallic, ao */
export type Mat = readonly [number, number, number]
export type P3 = [number, number, number]

// ------------------------------------------------------------------ palette
// Linear values. sRGB 0.85 is roughly linear 0.70.
export const PANEL: Rgb = [0.70, 0.685, 0.645]
export const PANEL_2: Rgb = [0.60, 0.59, 0.555]
export const PEACH: Rgb = [0.80, 0.40, 0.24]
export const PEACH_DK: Rgb = [0.55, 0.26, 0.15]
export const ALLOY: Rgb = [0.50, 0.51, 0.53]
export const DARKMETAL: Rgb = [0.085, 0.088, 0.098]
export const RAIL: Rgb = [0.09, 0.25, 0.45]
export const FLOORPAN: Rgb = [0.42, 0.43, 0.44]
export const GRATE: Rgb = [0.18, 0.185, 0.195]
export const CABLE: Rgb = [0.15, 0.155, 0.165]
export const BAG: Rgb = [0.66, 0.645, 0.60]
export const BAG_2: Rgb = [0.46, 0.48, 0.52]
export const LABEL: Rgb = [0.80, 0.79, 0.75]
export const AMBER_L: Rgb = [0.72, 0.44, 0.08]

export const M_PANEL: Mat = [0.62, 0.0, 1]
export const M_SOFT: Mat = [0.9, 0.0, 1]
export const M_METAL: Mat = [0.34, 0.85, 1]
export const M_RAIL: Mat = [0.3, 0.55, 1]
export const M_FRAME: Mat = [0.3, 0.7, 1]
export const M_RUBBER: Mat = [0.95, 0.0, 1]
export const M_FLOOR: Mat = [0.55, 0.25, 1]

export class Builder {
  /**
   * A growable Float32Array rather than a number[]. The interior now emits
   * around 2.7 million floats, and pushing those as boxed numbers and copying
   * them out again was most of the time spent building the vessel on mount.
   */
  private buf = new Float32Array(1 << 18)
  private n = 0

  private need(floats: number): void {
    if (this.n + floats <= this.buf.length) return
    let cap = this.buf.length
    while (cap < this.n + floats) cap *= 2
    const next = new Float32Array(cap)
    next.set(this.buf.subarray(0, this.n))
    this.buf = next
  }

  private push15(
    px: number, py: number, pz: number, nx: number, ny: number, nz: number,
    r: number, g: number, bl: number, ro: number, me: number, ao: number,
  ): void {
    this.need(15)
    const b = this.buf
    let i = this.n
    b[i++] = px; b[i++] = py; b[i++] = pz
    b[i++] = nx; b[i++] = ny; b[i++] = nz
    b[i++] = r; b[i++] = g; b[i++] = bl
    b[i++] = ro; b[i++] = me; b[i++] = ao
    // Irradiance, filled in by bakeFixtureLighting once the mesh is complete.
    b[i++] = 0; b[i++] = 0; b[i++] = 0
    this.n = i
  }

  get count(): number {
    return this.n / FLOATS_PER_VERTEX
  }

  data(): MeshData {
    return { vertices: this.buf.subarray(0, this.n), count: this.count }
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
    this.push15(a[0], a[1], a[2], nx, ny, nz, r, g, bl, ro, me, ao)
    this.push15(b[0], b[1], b[2], nx, ny, nz, r, g, bl, ro, me, ao)
    this.push15(c[0], c[1], c[2], nx, ny, nz, r, g, bl, ro, me, ao)
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
export function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// ------------------------------------------------------------- occupancy grid
/**
 * A coarse map of where the deck plan is walkable.
 *
 * Both bakes below ask "is this point inside the vessel?" millions of times,
 * and the authoritative answer walks a list of room rectangles. Rasterising
 * the plan once into a bitmap turns that into a single array index. The grid
 * is only consulted by the bakes, never by movement or collision, which keep
 * using the exact rectangles — so a cell boundary can never let a crew member
 * walk through a wall.
 */
const CELL = 0.1
let grid: Uint8Array | null = null
let gx0 = 0
let gz0 = 0
let gw = 0
let gh = 0

function buildGrid(): void {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const r of ROOMS) {
    minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1)
    minZ = Math.min(minZ, r.z0); maxZ = Math.max(maxZ, r.z1)
  }
  gx0 = minX - CELL
  gz0 = minZ - CELL
  gw = Math.ceil((maxX - minX) / CELL) + 2
  gh = Math.ceil((maxZ - minZ) / CELL) + 2
  grid = new Uint8Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      // Sample the cell centre against the real plan.
      if (inside(gx0 + (i + 0.5) * CELL, gz0 + (j + 0.5) * CELL)) grid[j * gw + i] = 1
    }
  }
}

/** Grid-accelerated `inside`, for the bakes only. */
function open(x: number, z: number): boolean {
  if (!grid) buildGrid()
  const i = ((x - gx0) / CELL) | 0
  const j = ((z - gz0) / CELL) | 0
  if (i < 0 || j < 0 || i >= gw || j >= gh) return false
  return grid![j * gw + i] === 1
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
  const R = (k: number) => rnd(seed * 7.13 + k * 3.77)

  // Each bay is a different piece of equipment, so each gets its own white.
  // Identical panels across a whole wall is what made it read as a grid of
  // rectangles rather than as a wall of hardware.
  const tintK = 0.88 + R(1) * 0.2
  const face: Rgb = [PANEL[0] * tintK, PANEL[1] * tintK, PANEL[2] * (tintK - 0.02)]
  const roughK = 0.5 + R(2) * 0.3

  // Rack front, set back behind a proud frame so the bay has real depth.
  b.quad(P(m, m, -0.05), P(m, bayH - m, -0.05), P(bayW - m, bayH - m, -0.05), P(bayW - m, m, -0.05), face, [roughK, 0, 1])
  // Frame: four sides standing out, plus their returns into the recess.
  for (const [u0, h0, u1, h1] of [
    [0, 0, bayW, m], [0, bayH - m, bayW, bayH], [0, 0, m, bayH], [bayW - m, 0, bayW, bayH],
  ]) {
    b.quad(P(u0, h0, 0.035), P(u0, h1, 0.035), P(u1, h1, 0.035), P(u1, h0, 0.035), ALLOY, M_METAL)
  }
  // Returns, which is what actually catches the light and gives the edge away.
  b.quad(P(m, m, 0.035), P(m, m, -0.05), P(bayW - m, m, -0.05), P(bayW - m, m, 0.035), ALLOY, M_METAL)
  b.quad(P(bayW - m, bayH - m, 0.035), P(bayW - m, bayH - m, -0.05), P(m, bayH - m, -0.05), P(m, bayH - m, 0.035), ALLOY, M_METAL)
  b.quad(P(m, m, -0.05), P(m, m, 0.035), P(m, bayH - m, 0.035), P(m, bayH - m, -0.05), ALLOY, M_METAL)
  b.quad(P(bayW - m, bayH - m, -0.05), P(bayW - m, bayH - m, 0.035), P(bayW - m, m, 0.035), P(bayW - m, m, -0.05), ALLOY, M_METAL)

  // A strong horizontal seam two thirds up, as the ISS racks carry.
  const seamY = m + (bayH - 2 * m) * 0.63
  b.quad(P(m, seamY, -0.012), P(m, seamY + 0.03, -0.012), P(bayW - m, seamY + 0.03, -0.012), P(bayW - m, seamY, -0.012), ALLOY, M_METAL)

  // Drawer fronts and sub-panels, each at its own depth so the wall has relief.
  const rows = 3
  const inner = bayH - 0.28
  for (let i = 0; i < rows; i++) {
    const h0 = m + 0.09 + (i * inner) / rows
    const h1 = h0 + inner / rows - 0.08
    const depth = -0.05 - 0.02 - R(10 + i) * 0.045
    const k = 0.84 + R(20 + i) * 0.26
    const tone: Rgb = R(30 + i) > 0.62 ? PANEL_2 : [face[0] * k, face[1] * k, face[2] * k]
    b.quad(P(m + 0.08, h0, depth), P(m + 0.08, h1, depth), P(bayW - m - 0.08, h1, depth), P(bayW - m - 0.08, h0, depth), tone, [0.5 + R(40 + i) * 0.35, 0, 1])
    // Side walls of the recess.
    b.quad(P(m + 0.08, h0, depth), P(m + 0.08, h1, depth), P(m + 0.08, h1, -0.05), P(m + 0.08, h0, -0.05), ALLOY, M_METAL)
    b.quad(P(bayW - m - 0.08, h1, depth), P(bayW - m - 0.08, h0, depth), P(bayW - m - 0.08, h0, -0.05), P(bayW - m - 0.08, h1, -0.05), ALLOY, M_METAL)
    b.quad(P(m + 0.08, h1, depth), P(bayW - m - 0.08, h1, depth), P(bayW - m - 0.08, h1, -0.05), P(m + 0.08, h1, -0.05), ALLOY, M_METAL)

    // A pull handle across the drawer: the single most recognisable rack fitting.
    if (R(50 + i) > 0.35) {
      const hy = (h0 + h1) / 2
      b.box(...boxPts(P(m + 0.2, hy - 0.022, 0.012), P(bayW - m - 0.2, hy + 0.022, 0.052)), ALLOY, M_METAL)
      for (const u of [m + 0.2, bayW - m - 0.2]) {
        b.box(...boxPts(P(u - 0.02, hy - 0.03, -0.05), P(u + 0.02, hy + 0.03, 0.03)), ALLOY, M_METAL)
      }
    }
    // Latch pairs.
    for (const u of [m + 0.15, bayW - m - 0.15]) {
      b.box(...boxPts(P(u - 0.032, h0 + 0.03, -0.05), P(u + 0.032, h0 + 0.088, 0.016)), ALLOY, M_METAL)
    }
    // Label strip.
    if (R(60 + i) > 0.3) {
      const lw = 0.14 + R(70 + i) * 0.24
      b.quad(P(m + 0.24, h1 - 0.085, depth + 0.004), P(m + 0.24, h1 - 0.035, depth + 0.004), P(m + 0.24 + lw, h1 - 0.035, depth + 0.004), P(m + 0.24 + lw, h1 - 0.085, depth + 0.004), LABEL, M_SOFT)
    }
    // Connector ports and indicator studs along the drawer front.
    const ports = Math.floor(R(80 + i) * 4)
    for (let k2 = 0; k2 < ports; k2++) {
      const u = m + 0.3 + k2 * 0.11 + R(90 + i + k2) * 0.04
      if (u > bayW - m - 0.18) break
      b.box(...boxPts(P(u - 0.021, h0 + 0.12, depth), P(u + 0.021, h0 + 0.162, depth + 0.028)), CABLE, M_RUBBER)
      b.box(...boxPts(P(u - 0.012, h0 + 0.131, depth + 0.028), P(u + 0.012, h0 + 0.151, depth + 0.04)), ALLOY, M_METAL)
    }
  }

  // One feature per bay: a vent, a stowage bag, a placard or a switch cluster.
  const kind = R(100)
  if (kind > 0.74) {
    const vh = 0.34
    const vy = bayH * 0.5 - vh / 2
    const u0 = bayW * 0.5 - 0.22
    const u1 = bayW * 0.5 + 0.22
    b.quad(P(u0, vy, -0.1), P(u0, vy + vh, -0.1), P(u1, vy + vh, -0.1), P(u1, vy, -0.1), GRATE, M_SOFT)
    b.quad(P(u0, vy, -0.1), P(u0, vy, -0.05), P(u0, vy + vh, -0.05), P(u0, vy + vh, -0.1), ALLOY, M_METAL)
    b.quad(P(u1, vy + vh, -0.1), P(u1, vy + vh, -0.05), P(u1, vy, -0.05), P(u1, vy, -0.1), ALLOY, M_METAL)
    for (let i = 0; i < 8; i++) {
      const yy = vy + 0.025 + (i * (vh - 0.05)) / 7
      b.box(...boxPts(P(u0, yy, -0.075), P(u1, yy + 0.014, -0.058)), ALLOY, M_METAL)
    }
  } else if (kind > 0.5) {
    const bw = 0.44, bh = 0.32, dep = 0.19
    const u0 = bayW * 0.5 - bw / 2
    const h0 = bayH * 0.4
    const faceCol = R(110) > 0.5 ? BAG : BAG_2
    b.quad(P(u0, h0, dep), P(u0, h0 + bh, dep), P(u0 + bw, h0 + bh, dep), P(u0 + bw, h0, dep), faceCol, M_SOFT)
    b.quad(P(u0, h0, -0.05), P(u0, h0, dep), P(u0 + bw, h0, dep), P(u0 + bw, h0, -0.05), BAG_2, M_SOFT)
    b.quad(P(u0, h0 + bh, dep), P(u0, h0 + bh, -0.05), P(u0 + bw, h0 + bh, -0.05), P(u0 + bw, h0 + bh, dep), BAG_2, M_SOFT)
    b.quad(P(u0, h0, -0.05), P(u0, h0 + bh, -0.05), P(u0, h0 + bh, dep), P(u0, h0, dep), BAG_2, M_SOFT)
    b.quad(P(u0 + bw, h0, dep), P(u0 + bw, h0 + bh, dep), P(u0 + bw, h0 + bh, -0.05), P(u0 + bw, h0, -0.05), BAG_2, M_SOFT)
    for (const t of [0.3, 0.72]) {
      const hh = h0 + bh * t
      b.quad(P(u0 - 0.025, hh, dep + 0.012), P(u0 - 0.025, hh + 0.018, dep + 0.012), P(u0 + bw + 0.025, hh + 0.018, dep + 0.012), P(u0 + bw + 0.025, hh, dep + 0.012), CABLE, M_RUBBER)
    }
  } else if (kind > 0.3) {
    // A cluster of switches and indicator lamps under a guard.
    const u0 = bayW * 0.5 - 0.17
    const hy = bayH * 0.52
    b.quad(P(u0 - 0.03, hy - 0.06, -0.062), P(u0 - 0.03, hy + 0.1, -0.062), P(u0 + 0.37, hy + 0.1, -0.062), P(u0 + 0.37, hy - 0.06, -0.062), PANEL_2, M_PANEL)
    for (let k2 = 0; k2 < 5; k2++) {
      const u = u0 + 0.02 + k2 * 0.075
      b.box(...boxPts(P(u - 0.016, hy, -0.062), P(u + 0.016, hy + 0.05, -0.028)), ALLOY, M_METAL)
      b.box(...boxPts(P(u - 0.01, hy - 0.042, -0.062), P(u + 0.01, hy - 0.022, -0.05)), R(120 + k2) > 0.6 ? AMBER_L : CABLE, M_SOFT)
    }
    b.box(...boxPts(P(u0 - 0.03, hy + 0.1, -0.062), P(u0 + 0.37, hy + 0.115, -0.022)), ALLOY, M_METAL)
  } else {
    b.quad(P(bayW - 0.32, bayH - 0.32, -0.044), P(bayW - 0.32, bayH - 0.19, -0.044), P(bayW - 0.13, bayH - 0.19, -0.044), P(bayW - 0.13, bayH - 0.32, -0.044), AMBER_L, M_SOFT)
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

    // A hatch in this wall leads somewhere there is no room on the other side
    // of — the outer hatch opens onto vacuum — so the opening has to be cut
    // out of the bulkhead. Without this the leaf swings aside to reveal a
    // solid wall, which is what it did the first time.
    const door = DOORS.find((d) => d.axis === along && Math.abs(d.at - end) < 0.01)
    if (door) {
      const dh = 2.0
      const lo = Math.max(w0 + c, Math.min(door.lo, door.hi))
      const hi = Math.min(w1 - c, Math.max(door.lo, door.hi))
      // Either side of the opening, full height.
      if (lo > w0 + c + 0.01) b.quad(W(end, w0 + c, 0), W(end, lo, 0), W(end, lo, h), W(end, w0 + c, h), PANEL_2, M_PANEL)
      if (hi < w1 - c - 0.01) b.quad(W(end, hi, 0), W(end, w1 - c, 0), W(end, w1 - c, h), W(end, hi, h), PANEL_2, M_PANEL)
      // The strip above it.
      if (h > dh) b.quad(W(end, lo, dh), W(end, hi, dh), W(end, hi, h), W(end, lo, h), PANEL_2, M_PANEL)
      // Chamfers, then rack panels only where there is wall to put them on.
      b.quad(W(end, w0, c), W(end, w0 + c, 0), W(end, w0 + c, h), W(end, w0, h - c), ALLOY, [0.5, 0.4, 1])
      b.quad(W(end, w1 - c, 0), W(end, w1, c), W(end, w1, h - c), W(end, w1 - c, h), ALLOY, [0.5, 0.4, 1])
      for (const [s0, s1] of [[w0 + c, lo], [hi, w1 - c]] as const) {
        if (s1 - s0 < 0.6) continue
        const n2 = Math.max(1, Math.round((s1 - s0) / 1.1))
        const pw2 = (s1 - s0) / n2
        for (let k = 0; k < n2; k++) {
          const u0 = s0 + k * pw2
          const place = (u: number, hh: number, out: number): P3 =>
            W(end + outward * out, u0 + (outward > 0 ? u : pw2 - u), c + hh)
          rackFace(b, place, pw2, h - 2 * c, 311 + k * 7.3 + (end === a0 ? 0 : 53))
        }
      }
      continue
    }

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

export function boxPts(a: P3, b: P3): [number, number, number, number, number, number] {
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

/**
 * The hatch leaves, as their own mesh.
 *
 * Built once at the origin and drawn twice with a model matrix, because they
 * are the only geometry in the vessel that moves. Their baked irradiance is
 * sampled where the shut hatch sits, which is where a leaf spends almost all
 * of its time and all of the time anyone is looking at it closely.
 */
export function buildHatches(): MeshData {
  const b = new Builder()
  hatchLeaf(b, 1.8, 2.0)
  const mesh = b.data()
  const v = mesh.vertices
  for (let o = 0; o < v.length; o += FLOATS_PER_VERTEX) {
    v[o + 12] = 0.30
    v[o + 13] = 0.295
    v[o + 14] = 0.275
  }
  return mesh
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
  evaPrepRoom(b)
  airlockChamber(b)
  galley(b)
  exerciseStation(b)
  commandArea(b)
  auxComputers(b)
  cableRuns(b)
  for (const d of DOORS) hatchSurround(b, d.id, 2.0)

  const mesh = b.data()
  orientFaces(mesh)
  bakeAmbientOcclusion(mesh)
  bakeFixtureLighting(mesh)
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
  const RAYS = 6
  const dirs: P3[] = []
  for (let i = 0; i < RAYS; i++) {
    const t = (i + 0.5) / RAYS
    const phi = Math.acos(1 - t * 0.92)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    dirs.push([Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)])
  }
  // Two probe distances rather than three. With the rack detail the mesh grew
  // to around 228,000 vertices, and at 24 samples each the bake was a visible
  // 300 ms hitch on mount. Twelve samples keeps the corner darkening that
  // matters and halves the cost; the difference in the result is not visible.
  const DIST = [0.22, 0.8]

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

    let seen = 0
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
        if (sy > 0.03 && sy < 3.2 && open(sx, sz)) seen++
      }
    }
    v[o + 11] *= 0.3 + 0.7 * Math.pow(total ? seen / total : 1, 0.8)
  }
}

/**
 * Per-vertex diffuse irradiance from every interior fixture, with visibility.
 *
 * This is the optimisation that bought the frame rate back. The fragment
 * shader used to loop a sixteen-element light array per pixel, evaluating a
 * full microfacet BRDF for each fixture that survived a distance cull.
 * Ablating the shader term by term measured that loop at 85 per cent of the
 * structure pass, which was itself 78 to 99 per cent of the frame; by
 * comparison the shadow map, the tonemap and the cupola wash were each under
 * five per cent. Capping the loop at four lights recovered 61 per cent of the
 * pass, which is the shape of a cost that is linear in light count.
 *
 * The rig does not move and neither does the vessel, so none of that work
 * needed to happen per pixel per frame. Each vertex's diffuse response to all
 * of the fixtures is summed once here instead.
 *
 * Baking is not merely cheaper, it is better. The old path capped at sixteen
 * of the twenty-four fixtures, so the aft end of the station was lit by
 * whichever lights happened to sort first, and it had no occlusion at all:
 * a fixture lit a vertex through a bulkhead if the two were close enough. Here
 * the segment from vertex to fixture is marched against the deck plan, so a
 * sleep station is dark inside, the inside of a hatch throat falls off, and
 * light does not cross a wall.
 *
 * What baking cannot do is the view-dependent part. Specular highlights move
 * with the eye, so a few fixtures are still sent to the shader each frame for
 * that alone — see `nearestFixtures` in the renderer.
 */
function bakeFixtureLighting(mesh: MeshData): void {
  const v = mesh.vertices
  const S = FLOATS_PER_VERTEX
  if (!grid) buildGrid()

  // Flat arrays: the inner loop runs a few million times and property access
  // on an object array shows up when it does.
  const n = FIXTURES.length
  const lx = new Float64Array(n), ly = new Float64Array(n), lz = new Float64Array(n)
  const lr = new Float64Array(n), lg = new Float64Array(n), lb = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    lx[i] = FIXTURES[i].p[0]; ly[i] = FIXTURES[i].p[1]; lz[i] = FIXTURES[i].p[2]
    lr[i] = FIXTURES[i].c[0]; lg[i] = FIXTURES[i].c[1]; lb[i] = FIXTURES[i].c[2]
  }

  for (let o = 0; o < v.length; o += S) {
    const px = v[o], py = v[o + 1], pz = v[o + 2]
    const nx = v[o + 3], ny = v[o + 4], nz = v[o + 5]
    let ir = 0, ig = 0, ib = 0

    for (let i = 0; i < n; i++) {
      const dx = lx[i] - px, dy = ly[i] - py, dz = lz[i] - pz
      const dist2 = dx * dx + dy * dy + dz * dz
      if (dist2 > FIXTURE_RANGE2 || dist2 < 1e-6) continue
      const inv = 1 / Math.sqrt(dist2)
      const nl = (dx * nx + dy * ny + dz * nz) * inv
      if (nl <= 0) continue

      // Visibility. Walk the segment and ask whether it stays in open space.
      // Six steps over at most 9.5 m is about 1.6 m apart, which is coarse but
      // the structures it has to catch — bulkheads, pod carcasses, the throat
      // of a hatch — are all much wider than that.
      const dist = Math.sqrt(dist2)
      let blocked = false
      const steps = 6
      for (let k = 1; k <= steps; k++) {
        const t = (k / (steps + 1)) * dist
        const sx = px + dx * inv * t + nx * 0.03
        const sy = py + dy * inv * t + ny * 0.03
        const sz = pz + dz * inv * t + nz * 0.03
        if (sy < 0.02 || sy > 3.4 || !open(sx, sz)) { blocked = true; break }
      }
      if (blocked) continue

      const a = nl * attenuation(dist2)
      ir += lr[i] * a; ig += lg[i] * a; ib += lb[i] * a
    }

    v[o + 12] = ir
    v[o + 13] = ig
    v[o + 14] = ib
  }
}
