import {
  ALLOY, AMBER_L, Builder, CABLE, DARKMETAL, GRATE, LABEL, M_METAL, M_PANEL, M_RAIL, M_RUBBER,
  M_SOFT, PANEL, PANEL_2, PEACH, RAIL, rnd, type Mat, type MeshData, type P3, type Rgb,
} from './geometry'
import { EVA_TASKS, HANDRAILS, EGRESS } from '../model/eva'
import { ROOMS } from '../model/deck'

/**
 * The outside of the station, for the spacewalk.
 *
 * The interior and the exterior are two separate meshes describing the same
 * vessel, and they are built from the same deck plan so they agree: a module
 * is a cylinder around the rectangle that a crew member walks about inside,
 * and the airlock's outer hatch is at the coordinates the EVA model uses as
 * its egress point. There is no second source of truth about where anything
 * is.
 *
 * ── On realism ────────────────────────────────────────────────────────────
 * The arrangement follows the ISS at the level of what goes where: pressurised
 * modules on one axis, a truss across them carrying arrays outboard and
 * radiators amidships, antennas on the zenith face, and handrails along every
 * path a crew member translates. It is substantially smaller and simpler than
 * the real station, carries no agency markings or mission insignia, and is
 * not a model of any specific flight article.
 */

const MLI: Rgb = [0.56, 0.54, 0.47]
const MLI_2: Rgb = [0.46, 0.45, 0.41]
const GOLDFOIL: Rgb = [0.55, 0.40, 0.13]
const SOLAR: Rgb = [0.030, 0.045, 0.105]
const SOLAR_2: Rgb = [0.055, 0.070, 0.150]
const RADPANEL: Rgb = [0.72, 0.72, 0.70]
const TRUSS: Rgb = [0.52, 0.52, 0.50]
const WORKSITE: Rgb = [0.70, 0.36, 0.06]

/** Multi-layer insulation: matte, slightly crinkled, not metallic. */
const M_MLI: Mat = [0.88, 0.0, 1]
const M_FOIL: Mat = [0.38, 0.75, 1]
const M_SOLAR: Mat = [0.18, 0.4, 1]
const M_RAD: Mat = [0.52, 0.1, 1]

/**
 * A pressurised module as seen from outside: a faceted cylinder wrapped in
 * insulation, with the blanket seams, standoffs and handrails that cover a
 * real one.
 */
function moduleHull(
  b: Builder, axis: 'x' | 'z', a0: number, a1: number, cu: number, cy: number, radius: number, seed: number,
  flatEnd: 'none' | 'a0' | 'a1' = 'none',
): void {
  const SEG = 14
  const P = (t: number, ang: number, r: number): P3 =>
    axis === 'z'
      ? [cu + Math.cos(ang) * r, cy + Math.sin(ang) * r, t]
      : [t, cy + Math.sin(ang) * r, cu + Math.cos(ang) * r]

  // Barrel, in bands so the insulation has seams across it.
  const bands = Math.max(2, Math.round((a1 - a0) / 1.6))
  for (let k = 0; k < bands; k++) {
    const t0 = a0 + ((a1 - a0) * k) / bands
    const t1 = a0 + ((a1 - a0) * (k + 1)) / bands
    const tint = 0.9 + rnd(seed + k * 4.1) * 0.2
    const col: Rgb = [MLI[0] * tint, MLI[1] * tint, MLI[2] * tint]
    for (let i = 0; i < SEG; i++) {
      const g0 = (i / SEG) * Math.PI * 2
      const g1 = ((i + 1) / SEG) * Math.PI * 2
      b.quad(P(t0, g0, radius), P(t1, g0, radius), P(t1, g1, radius), P(t0, g1, radius), col, M_MLI)
    }
    // Seam ring between blankets.
    for (let i = 0; i < SEG; i++) {
      const g0 = (i / SEG) * Math.PI * 2
      const g1 = ((i + 1) / SEG) * Math.PI * 2
      b.quad(P(t1 - 0.03, g0, radius + 0.025), P(t1 + 0.03, g0, radius + 0.025),
             P(t1 + 0.03, g1, radius + 0.025), P(t1 - 0.03, g1, radius + 0.025), MLI_2, M_MLI)
    }
  }
  // End caps. Domed back to the axis, except where a hatch has to sit on the
  // end: a cone there swallows the hatch and anything mounted beside it, which
  // is exactly what happened to the crew lock the first time.
  for (const [t, dir, which] of [[a0, -1, 'a0'], [a1, 1, 'a1']] as const) {
    const flat = flatEnd === which
    for (let i = 0; i < SEG; i++) {
      const g0 = (i / SEG) * Math.PI * 2
      const g1 = ((i + 1) / SEG) * Math.PI * 2
      if (flat) {
        b.tri(P(t, g0, 0.001), P(t, g0, radius), P(t, g1, radius), MLI_2, M_MLI)
      } else {
        b.tri(P(t + dir * 0.55, g0, 0.001), P(t, g0, radius), P(t, g1, radius), MLI_2, M_MLI)
      }
    }
  }
  // Longitudinal standoffs and a handrail run along the top of the module.
  for (const ang of [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.3]) {
    for (let t = a0 + 0.8; t < a1 - 0.5; t += 1.3) {
      const p0 = P(t - 0.05, ang, radius)
      const p1 = P(t + 0.05, ang, radius + 0.16)
      b.box(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], ALLOY, M_METAL)
    }
    const r0 = P(a0 + 0.8, ang, radius + 0.13)
    const r1 = P(a1 - 0.5, ang, radius + 0.19)
    b.box(r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], RAIL, M_RAIL)
  }
}

/**
 * A solar array wing: the mast, the blanket boxes and the blanket itself,
 * built as cells so the surface has the grid a photovoltaic panel has.
 */
function solarWing(b: Builder, x: number, y: number, z: number, dir: -1 | 1, span: number, seed: number): void {
  // Mast out from the truss.
  b.box(Math.min(x, x + dir * span), y - 0.16, z - 0.16, Math.max(x, x + dir * span), y + 0.16, z + 0.16, TRUSS, M_METAL)
  for (let k = 1; k < 7; k++) {
    const mx = x + dir * (span * k) / 7
    b.box(mx - 0.05, y - 0.26, z - 0.26, mx + 0.05, y + 0.26, z + 0.26, ALLOY, M_METAL)
  }
  // Two blankets either side of the mast, each a grid of cells.
  const CELLS_U = 16
  const CELLS_V = 7
  const halfW = 4.6
  for (const side of [-1, 1] as const) {
    const z0 = z + side * 0.3
    const z1 = z + side * (0.3 + halfW)
    for (let i = 0; i < CELLS_U; i++) {
      const u0 = x + dir * (0.6 + ((span - 1.0) * i) / CELLS_U)
      const u1 = x + dir * (0.6 + ((span - 1.0) * (i + 1)) / CELLS_U)
      for (let j = 0; j < CELLS_V; j++) {
        const v0 = z0 + ((z1 - z0) * j) / CELLS_V
        const v1 = z0 + ((z1 - z0) * (j + 1)) / CELLS_V
        // Inset each cell so the grid lines read as the gaps they are.
        const g = 0.04
        const k = rnd(seed + i * 2.7 + j * 5.3)
        const col: Rgb = k > 0.5 ? SOLAR : SOLAR_2
        const gu = Math.sign(u1 - u0) * g
        const gv = Math.sign(v1 - v0) * g
        for (const yy of [y - 0.035, y + 0.035]) {
          b.quad([u0 + gu, yy, v0 + gv], [u1 - gu, yy, v0 + gv], [u1 - gu, yy, v1 - gv], [u0 + gu, yy, v1 - gv], col, M_SOLAR)
        }
      }
    }
    // Blanket box at the root and the tensioning cable at the tip.
    b.box(x + dir * 0.2, y - 0.3, Math.min(z0, z1), x + dir * 0.62, y + 0.3, Math.max(z0, z1), PANEL_2, M_PANEL)
    const tip = x + dir * (span - 0.4)
    b.box(tip - 0.06, y - 0.05, Math.min(z0, z1), tip + 0.06, y + 0.05, Math.max(z0, z1), ALLOY, M_METAL)
  }
}

/** A radiator: hinged panels with the flow lines along their root. */
function radiator(b: Builder, x: number, y: number, z: number, dir: -1 | 1, seed: number): void {
  const panels = 3
  for (let i = 0; i < panels; i++) {
    const x0 = x + dir * (0.4 + i * 3.1)
    const x1 = x0 + dir * 2.95
    const tint = 0.94 + rnd(seed + i) * 0.1
    const col: Rgb = [RADPANEL[0] * tint, RADPANEL[1] * tint, RADPANEL[2] * tint]
    for (const yy of [y - 0.05, y + 0.05]) {
      b.quad([Math.min(x0, x1), yy, z - 2.1], [Math.max(x0, x1), yy, z - 2.1], [Math.max(x0, x1), yy, z + 2.1], [Math.min(x0, x1), yy, z + 2.1], col, M_RAD)
    }
    // Edges, so the panel has thickness from a grazing angle.
    for (const zz of [z - 2.1, z + 2.1]) {
      b.box(Math.min(x0, x1), y - 0.05, zz - 0.02, Math.max(x0, x1), y + 0.05, zz + 0.02, ALLOY, M_METAL)
    }
    // Flow tubes across the face.
    for (let k = 0; k < 6; k++) {
      const zz = z - 1.7 + k * 0.68
      b.box(Math.min(x0, x1) + 0.1, y + 0.05, zz - 0.025, Math.max(x0, x1) - 0.1, y + 0.085, zz + 0.025, ALLOY, M_METAL)
    }
    // Hinge between panels.
    b.box(x0 - dir * 0.08, y - 0.12, z - 2.1, x0 + dir * 0.08, y + 0.12, z + 2.1, GRATE, M_METAL)
  }
  // Rotary joint and the ammonia lines back toward the modules.
  b.box(x - dir * 0.45, y - 0.3, z - 0.45, x + dir * 0.45, y + 0.3, z + 0.45, PANEL_2, M_PANEL)
  for (const zz of [z - 0.22, z + 0.22]) {
    b.box(Math.min(x, x - dir * 2.4), y - 0.06, zz - 0.045, Math.max(x, x - dir * 2.4), y + 0.06, zz + 0.045, ALLOY, M_METAL)
  }
}

/** The truss: a square-section lattice with diagonals, as the real one is. */
function trussRun(b: Builder, x0: number, x1: number, y: number, z: number, half: number): void {
  const bays = Math.max(2, Math.round((x1 - x0) / 2.2))
  const chord = 0.085
  // Four longerons.
  for (const dy of [-half, half]) {
    for (const dz of [-half, half]) {
      b.box(x0, y + dy - chord, z + dz - chord, x1, y + dy + chord, z + dz + chord, TRUSS, M_METAL)
    }
  }
  for (let k = 0; k <= bays; k++) {
    const x = x0 + ((x1 - x0) * k) / bays
    // Battens: the square frame at each bay.
    for (const dy of [-half, half]) {
      b.box(x - 0.06, y + dy - 0.06, z - half, x + 0.06, y + dy + 0.06, z + half, TRUSS, M_METAL)
    }
    for (const dz of [-half, half]) {
      b.box(x - 0.06, y - half, z + dz - 0.06, x + 0.06, y + half, z + dz + 0.06, TRUSS, M_METAL)
    }
    if (k === bays) continue
    // Diagonals on all four faces, alternating direction bay to bay.
    const xa = x
    const xb = x0 + ((x1 - x0) * (k + 1)) / bays
    const flip = k % 2 === 0
    for (const [dz, s] of [[-half, 1], [half, -1]] as const) {
      const ya = flip ? y - half : y + half
      const yb = flip ? y + half : y - half
      diagonal(b, [xa, ya, z + dz], [xb, yb, z + dz], 0.05)
      void s
    }
    for (const dy of [-half, half]) {
      const za = flip ? z - half : z + half
      const zb = flip ? z + half : z - half
      diagonal(b, [xa, y + dy, za], [xb, y + dy, zb], 0.05)
    }
  }
}

/** A strut between two points, as a thin box aligned to the segment. */
function diagonal(b: Builder, a: P3, c: P3, r: number): void {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2]
  const len = Math.hypot(dx, dy, dz) || 1
  const ux = dx / len, uy = dy / len, uz = dz / len
  // Build a frame about the strut.
  const up: P3 = Math.abs(uy) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  let px = up[1] * uz - up[2] * uy
  let py = up[2] * ux - up[0] * uz
  let pz = up[0] * uy - up[1] * ux
  const pl = Math.hypot(px, py, pz) || 1
  px /= pl; py /= pl; pz /= pl
  const qx = uy * pz - uz * py
  const qy = uz * px - ux * pz
  const qz = ux * py - uy * px
  const corner = (t: number, s1: number, s2: number): P3 => [
    a[0] + ux * t * len + px * s1 * r + qx * s2 * r,
    a[1] + uy * t * len + py * s1 * r + qy * s2 * r,
    a[2] + uz * t * len + pz * s1 * r + qz * s2 * r,
  ]
  for (const [s1, s2, t1, t2] of [[1, 0, 0, 1], [-1, 0, 0, 1], [0, 1, 0, 1], [0, -1, 0, 1]] as const) {
    void t1; void t2
    const o1 = s1 !== 0 ? [s1, -1] : [-1, s2]
    const o2 = s1 !== 0 ? [s1, 1] : [1, s2]
    b.quad(
      corner(0, o1[0], o1[1]), corner(1, o1[0], o1[1]),
      corner(1, o2[0], o2[1]), corner(0, o2[0], o2[1]),
      TRUSS, M_METAL,
    )
  }
}

/** Handrails along the translation paths, from the EVA model's own list. */
function exteriorHandrails(b: Builder): void {
  for (const { a, c } of HANDRAILS.map((h) => ({ a: h.a, c: h.b }))) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2]
    const len = Math.hypot(dx, dy, dz) || 1
    const n = Math.max(2, Math.round(len / 0.9))
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 0.78) / n
      const p0: P3 = [a[0] + dx * t0, a[1] + dy * t0, a[2] + dz * t0]
      const p1: P3 = [a[0] + dx * t1, a[1] + dy * t1, a[2] + dz * t1]
      // The rail itself.
      diagonal(b, p0, p1, 0.035)
      // Stand-offs at each end, so it is held off the surface.
      for (const p of [p0, p1]) {
        b.box(p[0] - 0.045, p[1] - 0.045, p[2] - 0.045, p[0] + 0.045, p[1] + 0.045, p[2] + 0.045, ALLOY, M_METAL)
      }
    }
  }
}

/** A marked worksite: the interface fitting, a placard and a local light. */
function worksite(b: Builder, x: number, y: number, z: number): void {
  // Worksite interface: the socket a foot restraint or tool clamps into.
  b.box(x - 0.17, y - 0.17, z - 0.17, x + 0.17, y + 0.17, z + 0.17, PANEL_2, M_PANEL)
  b.box(x - 0.11, y + 0.17, z - 0.11, x + 0.11, y + 0.3, z + 0.11, ALLOY, M_METAL)
  // Yellow-orange guidance marking around it, which is how a real one is found.
  for (const [ax, ay] of [[0.26, 0.04], [0.04, 0.26]] as const) {
    b.box(x - ax, y - ay, z - 0.19, x + ax, y + ay, z - 0.175, WORKSITE, M_SOFT)
  }
  b.quad([x - 0.2, y - 0.42, z - 0.18], [x - 0.2, y - 0.3, z - 0.18], [x + 0.2, y - 0.3, z - 0.18], [x + 0.2, y - 0.42, z - 0.18], LABEL, M_SOFT)
  // Local floodlight on a bracket.
  b.box(x + 0.28, y + 0.28, z - 0.06, x + 0.4, y + 0.4, z + 0.06, ALLOY, M_METAL)
}

/**
 * The whole exterior.
 *
 * Built as its own mesh so it costs nothing while a crew member is inside:
 * the renderer draws either the interior or the exterior, never both.
 */
export function buildExterior(): MeshData {
  const b = new Builder()

  // ---- pressurised modules, from the same rectangles as the interior
  const spine = ROOMS.find((r) => r.id === 'spine')!
  moduleHull(b, 'z', spine.z0 - 0.4, spine.z1 + 0.4, 0, 1.4, 2.75, 3.1)
  const cmd = ROOMS.find((r) => r.id === 'command')!
  moduleHull(b, 'z', cmd.z0, cmd.z1 + 0.5, 0, 1.6, 3.3, 11.7)
  for (const id of ['medical', 'crew', 'environment', 'comms', 'research', 'airlock']) {
    const r = ROOMS.find((x) => x.id === id)
    if (!r) continue
    const inboard = r.x0 > 0 ? r.x0 : r.x1
    const outboard = r.x0 > 0 ? r.x1 : r.x0
    moduleHull(b, 'x', Math.min(inboard, outboard), Math.max(inboard, outboard), (r.z0 + r.z1) / 2, 1.4, 2.6, 20 + r.x0)
  }
  // The crew lock, smaller, outboard of the preparation module.
  const ch = ROOMS.find((r) => r.id === 'chamber')!
  moduleHull(b, 'x', ch.x0 - 0.3, ch.x1, (ch.z0 + ch.z1) / 2, 1.35, 1.75, 41.3, 'a0')

  // ---- the outer hatch, on the crew lock's flat end, where a crew member
  // comes out. The face is at ch.x0 - 0.3; everything here stands proud of it.
  const hx = ch.x0 - 0.3
  const hz = EGRESS.z
  // Collar and the hatch cover itself, standing off the face.
  b.box(hx - 0.14, 0.52, hz - 1.0, hx, 2.28, hz + 1.0, PEACH, M_PANEL)
  b.box(hx - 0.26, 0.66, hz - 0.86, hx - 0.14, 2.14, hz + 0.86, MLI, M_MLI)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    b.box(
      hx - 0.3, 1.4 + Math.sin(a) * 0.82 - 0.04, hz + Math.cos(a) * 0.82 - 0.04,
      hx - 0.2, 1.4 + Math.sin(a) * 0.82 + 0.04, hz + Math.cos(a) * 0.82 + 0.04, ALLOY, M_METAL,
    )
  }
  // Locking wheel on the outside of the cover.
  b.box(hx - 0.36, 1.33, hz - 0.07, hx - 0.26, 1.47, hz + 0.07, ALLOY, M_METAL)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    b.box(hx - 0.34, 1.4 + Math.sin(a) * 0.18 - 0.03, hz + Math.cos(a) * 0.18 - 0.03,
          hx - 0.3, 1.4 + Math.sin(a) * 0.18 + 0.03, hz + Math.cos(a) * 0.18 + 0.03, ALLOY, M_METAL)
  }
  // Grab rails either side of the opening, and a floodlight above it.
  for (const dz of [-1.12, 1.12]) {
    b.box(hx - 0.3, 0.8, hz + dz - 0.04, hx - 0.18, 2.0, hz + dz + 0.04, RAIL, M_RAIL)
  }
  b.box(hx - 0.3, 2.3, hz - 0.18, hx - 0.1, 2.5, hz + 0.18, ALLOY, M_METAL)
  b.box(hx - 0.34, 2.34, hz - 0.13, hx - 0.3, 2.46, hz + 0.13, [0.9, 0.88, 0.8], M_SOFT)
  // Tether anchor, which is what the safety tether actually runs back to.
  b.box(hx - 0.34, 1.0, hz + 1.3, hx - 0.04, 1.3, hz + 1.6, ALLOY, M_METAL)
  b.box(hx - 0.28, 1.05, hz + 1.6, hx - 0.1, 1.25, hz + 1.74, RAIL, M_RAIL)
  // Caution marking around the opening.
  b.box(hx - 0.15, 0.52, hz - 1.0, hx - 0.145, 0.62, hz + 1.0, AMBER_L, M_SOFT)

  // ---- the truss, across the modules on the zenith side
  trussRun(b, -26.5, 20.0, 6.9, -2.0, 0.85)
  // Connection from the truss down to the spine.
  for (const x of [-2.0, 2.0]) {
    diagonal(b, [x, 6.05, -2.0], [x * 0.35, 3.1, -2.0], 0.12)
  }

  // ---- arrays, outboard on both sides
  solarWing(b, -27.0, 7.4, -2.0, -1, 7.5, 5.5)
  solarWing(b, 20.5, 7.4, -2.0, 1, 7.5, 9.2)

  // ---- radiators, amidships
  radiator(b, 11.0, 6.0, 1.5, 1, 14.1)
  radiator(b, -11.0, 6.0, 1.5, -1, 22.7)

  // ---- antennas on the zenith face
  // Boom with a dish at the top.
  b.box(1.65, 7.0, 6.35, 1.95, 11.2, 6.65, TRUSS, M_METAL)
  for (let i = 1; i < 4; i++) {
    b.box(1.5, 7.0 + i * 1.05, 6.2, 2.1, 7.1 + i * 1.05, 6.8, ALLOY, M_METAL)
  }
  const dish = (cx: number, cy: number, cz: number, r: number) => {
    const SEG = 14
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2
      const a1 = ((i + 1) / SEG) * Math.PI * 2
      for (let j = 0; j < 3; j++) {
        const r0 = (r * j) / 3
        const r1 = (r * (j + 1)) / 3
        const d0 = (r0 * r0) / (r * 2)
        const d1 = (r1 * r1) / (r * 2)
        b.quad(
          [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cz + d0],
          [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1, cz + d1],
          [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, cz + d1],
          [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, cz + d0],
          GOLDFOIL, M_FOIL,
        )
      }
    }
    // Feed horn on three struts.
    b.box(cx - 0.07, cy - 0.07, cz - r * 0.55, cx + 0.07, cy + 0.07, cz - r * 0.35, ALLOY, M_METAL)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      diagonal(b, [cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, cz + r * 0.3], [cx, cy, cz - r * 0.4], 0.025)
    }
  }
  dish(1.8, 11.6, 6.5, 1.15)
  // A second, smaller antenna further aft.
  b.box(-4.3, 6.9, -14.0, -4.0, 9.0, -13.7, TRUSS, M_METAL)
  dish(-4.15, 9.4, -13.85, 0.6)

  // ---- external equipment: stowage platforms and payload boxes on the truss
  for (const [x, z] of [[-6.5, -2.0], [5.0, -2.0], [14.0, -2.0]] as const) {
    b.box(x - 1.1, 7.75, z - 0.7, x + 1.1, 7.95, z + 0.7, GRATE, M_METAL)
    for (let i = 0; i < 3; i++) {
      const k = rnd(x * 3.3 + i)
      b.box(x - 0.9 + i * 0.62, 7.95, z - 0.45 + k * 0.2, x - 0.42 + i * 0.62, 8.3 + k * 0.25, z + 0.35, k > 0.5 ? PANEL : MLI, k > 0.5 ? M_PANEL : M_MLI)
    }
    for (const dx of [-1.1, 1.1]) diagonal(b, [x + dx, 7.75, z], [x + dx * 0.4, 7.05, z], 0.04)
  }

  // ---- external cable trays along the truss, which EVA-04 works on
  for (const dz of [-0.55, 0.55]) {
    b.box(-14.5, 7.05, -2.0 + dz - 0.1, 10.5, 7.2, -2.0 + dz + 0.1, GRATE, M_METAL)
    for (const [thick, col] of [[0.04, CABLE], [0.055, GRATE], [0.035, RAIL]] as const) {
      b.box(-14.5, 7.2, -2.0 + dz - thick, 10.5, 7.2 + thick * 2, -2.0 + dz + thick, col as Rgb, M_RUBBER)
    }
    for (let x = -14.0; x < 10.0; x += 1.9) {
      b.box(x - 0.04, 7.05, -2.0 + dz - 0.13, x + 0.04, 7.34, -2.0 + dz + 0.13, ALLOY, M_METAL)
    }
  }

  // ---- the sensor mount EVA-02 services, on the research module hull
  const sens = EVA_TASKS.find((t) => t.id === 'eva-02')!.site
  b.box(sens.x - 0.5, sens.y - 0.3, sens.z - 0.3, sens.x - 0.2, sens.y + 0.3, sens.z + 0.3, PANEL_2, M_PANEL)
  b.box(sens.x - 0.2, sens.y - 0.16, sens.z - 0.16, sens.x + 0.1, sens.y + 0.16, sens.z + 0.16, DARKMETAL, [0.3, 0.6, 1])
  b.box(sens.x + 0.1, sens.y - 0.05, sens.z - 0.05, sens.x + 0.26, sens.y + 0.05, sens.z + 0.05, ALLOY, M_METAL)

  // ---- worksite markings at each of the five tasks
  for (const t of EVA_TASKS) worksite(b, t.site.x, t.site.y, t.site.z)

  exteriorHandrails(b)

  // ---- navigation and caution lights around the hull
  for (const [x, y, z] of [[-10.9, 2.6, -21.7], [2.6, 2.6, 22.0], [-2.6, 2.6, 22.0], [9.4, 2.4, -21.0]] as const) {
    b.box(x - 0.08, y - 0.08, z - 0.08, x + 0.08, y + 0.08, z + 0.08, AMBER_L, M_SOFT)
  }

  const mesh = b.data()
  // Earthshine and the ambient of a lit orbit, as a flat irradiance floor.
  // The exterior has no fixtures to bake, so this stands in for the light that
  // reaches a surface from the planet below and from the rest of the station.
  const v = mesh.vertices
  for (let o = 0; o < v.length; o += 15) {
    const ny = v[o + 4]
    // Surfaces facing the planet pick up noticeably more of it.
    const down = Math.max(0, -ny) * 0.5 + 0.25
    v[o + 12] = 0.052 * down
    v[o + 13] = 0.068 * down
    v[o + 14] = 0.098 * down
  }
  return mesh
}
