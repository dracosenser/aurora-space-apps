import { ROOMS, STATIONS, WINDOW, inside, type Room } from '../model/deck'

/**
 * Procedural interior. Nothing is loaded from disk: the whole vessel is built
 * from the deck plan at startup into one interleaved buffer, which keeps the
 * draw down to a couple of calls and means there are no assets to ship.
 *
 * Vertex layout, 9 floats:
 *   position xyz | normal xyz | albedo rgb
 *
 * Emissive surfaces are handled by a separate buffer so the shader can skip
 * lighting them, which is what lets screens read as light sources rather than
 * as lit panels.
 */

export interface MeshData {
  /** Interleaved pos(3) normal(3) colour(3). */
  vertices: Float32Array
  count: number
}

class Builder {
  private v: number[] = []

  get count(): number {
    return this.v.length / 9
  }

  data(): MeshData {
    return { vertices: new Float32Array(this.v), count: this.count }
  }

  /** One triangle, flat-shaded from its own winding. */
  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    r: number, g: number, b: number,
  ): void {
    const ux = bx - ax
    const uy = by - ay
    const uz = bz - az
    const vx = cx - ax
    const vy = cy - ay
    const vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    this.v.push(ax, ay, az, nx, ny, nz, r, g, b)
    this.v.push(bx, by, bz, nx, ny, nz, r, g, b)
    this.v.push(cx, cy, cz, nx, ny, nz, r, g, b)
  }

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    r: number, g: number, b: number,
  ): void {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b)
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, r, g, b)
  }

  /** Axis-aligned box, inward-facing optional for rooms. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, g: number, b: number): void {
    this.quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, r, g, b) // top
    this.quad(x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0, r, g, b) // bottom
    this.quad(x0, y0, z1, x0, y1, z1, x1, y1, z1, x1, y0, z1, r, g, b) // +z
    this.quad(x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z0, r, g, b) // -z
    this.quad(x1, y0, z1, x1, y1, z1, x1, y1, z0, x1, y0, z0, r, g, b) // +x
    this.quad(x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1, r, g, b) // -x
  }
}

// ---------------------------------------------------------------- palette
// Matte greys with a cool cast, so the only saturated light in the room comes
// from the instruments. Values are linear-ish; the shader tonemaps.
const DECK = [0.085, 0.09, 0.1] as const
const WALL = [0.13, 0.138, 0.152] as const
const WALL_LOW = [0.1, 0.105, 0.118] as const
const RIB = [0.175, 0.185, 0.2] as const
const TRIM = [0.26, 0.28, 0.3] as const
const CONSOLE = [0.115, 0.122, 0.135] as const

/** Wall segments are emitted in 0.25 m pieces so doorways appear by omission. */
const SEG = 0.25

function wallRun(
  b: Builder,
  fixed: 'x' | 'z',
  fixedValue: number,
  from: number,
  to: number,
  height: number,
  outward: 1 | -1,
): void {
  const n = Math.max(1, Math.round((to - from) / SEG))
  const step = (to - from) / n
  for (let i = 0; i < n; i++) {
    const a = from + i * step
    const c = a + step
    const mid = (a + c) / 2
    // If the space just outside this segment is also walkable, it is a doorway.
    const probeX = fixed === 'x' ? fixedValue + outward * 0.3 : mid
    const probeZ = fixed === 'x' ? mid : fixedValue + outward * 0.3
    if (inside(probeX, probeZ)) continue

    const lowTop = 1.05
    if (fixed === 'x') {
      const x = fixedValue
      // Dado band, then the upper wall: two tones give the surface a horizon.
      if (outward > 0) {
        b.quad(x, 0, a, x, lowTop, a, x, lowTop, c, x, 0, c, ...WALL_LOW)
        b.quad(x, lowTop, a, x, height, a, x, height, c, x, lowTop, c, ...WALL)
        b.quad(x, lowTop, a, x, lowTop + 0.04, a, x, lowTop + 0.04, c, x, lowTop, c, ...TRIM)
      } else {
        b.quad(x, 0, c, x, lowTop, c, x, lowTop, a, x, 0, a, ...WALL_LOW)
        b.quad(x, lowTop, c, x, height, c, x, height, a, x, lowTop, a, ...WALL)
        b.quad(x, lowTop, c, x, lowTop + 0.04, c, x, lowTop + 0.04, a, x, lowTop, a, ...TRIM)
      }
    } else {
      const z = fixedValue
      if (outward > 0) {
        b.quad(c, 0, z, c, lowTop, z, a, lowTop, z, a, 0, z, ...WALL_LOW)
        b.quad(c, lowTop, z, c, height, z, a, height, z, a, lowTop, z, ...WALL)
        b.quad(c, lowTop, z, c, lowTop + 0.04, z, a, lowTop + 0.04, z, a, lowTop, z, ...TRIM)
      } else {
        b.quad(a, 0, z, a, lowTop, z, c, lowTop, z, c, 0, z, ...WALL_LOW)
        b.quad(a, lowTop, z, a, height, z, c, height, z, c, lowTop, z, ...WALL)
        b.quad(a, lowTop, z, a, lowTop + 0.04, z, c, lowTop + 0.04, z, c, lowTop, z, ...TRIM)
      }
    }
  }
}

/** The forward wall of the command deck, built around the window aperture. */
function bowWall(b: Builder, r: Room): void {
  const z = r.z1
  const { x0: wx0, x1: wx1, y0: wy0, y1: wy1 } = WINDOW
  // Left of the aperture, right of it, under it, over it.
  b.quad(wx0, 0, z, wx0, r.height, z, r.x0, r.height, z, r.x0, 0, z, ...WALL)
  b.quad(r.x1, 0, z, r.x1, r.height, z, wx1, r.height, z, wx1, 0, z, ...WALL)
  b.quad(wx1, 0, z, wx1, wy0, z, wx0, wy0, z, wx0, 0, z, ...WALL_LOW)
  b.quad(wx1, wy1, z, wx1, r.height, z, wx0, r.height, z, wx0, wy1, z, ...WALL)
  // A reveal around the glass so the hull reads as thick.
  const d = 0.22
  b.quad(wx0, wy0, z, wx0, wy1, z, wx0, wy1, z - d, wx0, wy0, z - d, ...TRIM)
  b.quad(wx1, wy0, z - d, wx1, wy1, z - d, wx1, wy1, z, wx1, wy0, z, ...TRIM)
  b.quad(wx0, wy1, z - d, wx0, wy1, z, wx1, wy1, z, wx1, wy1, z - d, ...TRIM)
  b.quad(wx0, wy0, z, wx0, wy0, z - d, wx1, wy0, z - d, wx1, wy0, z, ...TRIM)
  // Mullions: three uprights breaking the glass into panes.
  for (let i = 1; i <= 3; i++) {
    const mx = wx0 + ((wx1 - wx0) * i) / 4
    b.box(mx - 0.06, wy0, z - 0.06, mx + 0.06, wy1, z + 0.02, ...TRIM)
  }
}

/** Structural ribs at intervals along a compartment, for depth. */
function ribs(b: Builder, r: Room): void {
  const span = r.z1 - r.z0
  const n = Math.max(1, Math.round(span / 3.2))
  for (let i = 1; i < n; i++) {
    const z = r.z0 + (span * i) / n
    b.box(r.x0, r.height - 0.26, z - 0.09, r.x1, r.height - 0.02, z + 0.09, ...RIB)
    b.box(r.x0 + 0.02, 1.05, z - 0.07, r.x0 + 0.14, r.height - 0.26, z + 0.07, ...RIB)
    b.box(r.x1 - 0.14, 1.05, z - 0.07, r.x1 - 0.02, r.height - 0.26, z + 0.07, ...RIB)
  }
}

/** A console body: a canted desk with a housing. The screen is emissive. */
function consoleBody(b: Builder, x: number, z: number, facing: number, width: number): void {
  const c = Math.cos(facing)
  const s = Math.sin(facing)
  // Local -> world. Local +x is the console's width, local +z is away from the user.
  const P = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * c + lz * s, ly, z - lx * s + lz * c]
  const hw = width / 2
  const put = (
    p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number],
    col: readonly [number, number, number],
  ) => b.quad(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], col[0], col[1], col[2])

  // Plinth
  put(P(-hw, 0, 0.0), P(-hw, 0.78, 0.0), P(hw, 0.78, 0.0), P(hw, 0, 0.0), CONSOLE)
  put(P(-hw, 0.78, 0.0), P(-hw, 0.78, 0.5), P(hw, 0.78, 0.5), P(hw, 0.78, 0.0), CONSOLE)
  put(P(-hw, 0, 0.5), P(-hw, 0.78, 0.5), P(-hw, 0.78, 0.0), P(-hw, 0, 0.0), CONSOLE)
  put(P(hw, 0, 0.0), P(hw, 0.78, 0.0), P(hw, 0.78, 0.5), P(hw, 0, 0.5), CONSOLE)
  // Canted screen housing rising behind the desk
  put(P(-hw, 0.78, 0.5), P(-hw, 1.92, 0.78), P(hw, 1.92, 0.78), P(hw, 0.78, 0.5), CONSOLE)
  put(P(-hw, 1.92, 0.78), P(-hw, 1.98, 0.9), P(hw, 1.98, 0.9), P(hw, 1.92, 0.78), TRIM)
  // Side cheeks
  put(P(-hw, 0.78, 0.5), P(-hw, 0.78, 0.9), P(-hw, 1.98, 0.9), P(-hw, 1.92, 0.78), CONSOLE)
  put(P(hw, 1.92, 0.78), P(hw, 1.98, 0.9), P(hw, 0.78, 0.9), P(hw, 0.78, 0.5), CONSOLE)
}

/** The lit parts: screens and strip lighting. Drawn unlit and additively. */
export function buildEmissive(): MeshData {
  const b = new Builder()
  for (const s of STATIONS) {
    const c = Math.cos(s.facing)
    const sn = Math.sin(s.facing)
    const P = (lx: number, ly: number, lz: number): [number, number, number] => [s.x + lx * c + lz * sn, ly, s.z - lx * sn + lz * c]
    const hw = s.width / 2 - 0.12
    // The screen face, inset slightly into the housing.
    const p0 = P(-hw, 0.9, 0.47)
    const p1 = P(-hw, 1.86, 0.715)
    const p2 = P(hw, 1.86, 0.715)
    const p3 = P(hw, 0.9, 0.47)
    b.quad(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 0.038, 0.1, 0.138)
    // Desk glow strip
    const q0 = P(-hw, 0.79, 0.12)
    const q1 = P(-hw, 0.79, 0.4)
    const q2 = P(hw, 0.79, 0.4)
    const q3 = P(hw, 0.79, 0.12)
    b.quad(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], q2[0], q2[1], q2[2], q3[0], q3[1], q3[2], 0.042, 0.11, 0.15)
  }
  // Deck-head light runs down the spine and across the command deck.
  for (const r of ROOMS) {
    const y = r.height - 0.05
    const cx = (r.x0 + r.x1) / 2
    b.quad(cx - 0.26, y, r.z0 + 0.4, cx - 0.26, y, r.z1 - 0.4, cx + 0.26, y, r.z1 - 0.4, cx + 0.26, y, r.z0 + 0.4, 0.2, 0.225, 0.265)
  }
  // Floor guidance stripe along the spine, amber at the junctions.
  b.quad(-0.18, 0.012, -15.4, -0.18, 0.012, 14.4, 0.18, 0.012, 14.4, 0.18, 0.012, -15.4, 0.1, 0.11, 0.13)
  return b.data()
}

/** Everything that is lit by the room. */
export function buildStructure(): MeshData {
  const b = new Builder()
  for (const r of ROOMS) {
    // Deck and deck-head
    b.quad(r.x0, 0, r.z0, r.x0, 0, r.z1, r.x1, 0, r.z1, r.x1, 0, r.z0, ...DECK)
    b.quad(r.x0, r.height, r.z1, r.x0, r.height, r.z0, r.x1, r.height, r.z0, r.x1, r.height, r.z1, ...WALL_LOW)
    // Perimeter, minus doorways
    const isBow = r.id === 'command'
    wallRun(b, 'x', r.x0, r.z0, r.z1, r.height, -1)
    wallRun(b, 'x', r.x1, r.z0, r.z1, r.height, 1)
    wallRun(b, 'z', r.z0, r.x0, r.x1, r.height, -1)
    if (isBow) bowWall(b, r)
    else wallRun(b, 'z', r.z1, r.x0, r.x1, r.height, 1)
    ribs(b, r)
  }
  for (const s of STATIONS) consoleBody(b, s.x, s.z, s.facing, s.width)
  return b.data()
}
