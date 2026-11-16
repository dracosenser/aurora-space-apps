/**
 * The deck plan of the research vessel.
 *
 * One source of truth. The renderer builds walls from these rectangles and the
 * player collides against the same rectangles, so what you can see and where
 * you can walk can never drift apart. Doorways are not authored: a wall segment
 * is omitted wherever it would open into another room, which means moving a
 * room moves its doors with it.
 *
 * Coordinates are metres. +x is starboard, +z is forward (toward the bow),
 * +y is up. The crew deck is a spine with four alcoves off it and the command
 * deck across the bow.
 */

export interface Room {
  id: string
  label: string
  /** Axis-aligned footprint. */
  x0: number
  x1: number
  z0: number
  z1: number
  /** Deck-head height for this compartment. */
  height: number
  /**
   * Axis the module runs on. Defaults to the longer side, which is right for
   * every compartment except the command module: that one is wider than it is
   * deep, but its forward face carries the cupola rather than rack bays.
   */
  along?: 'x' | 'z'
}

export type StationId = 'navigation' | 'medical' | 'crew' | 'environment' | 'comms' | 'research'

export interface Station {
  id: StationId
  label: string
  /** Short line shown on the approach prompt. */
  hint: string
  /** Console centre. */
  x: number
  z: number
  /** Facing in radians: the direction the console's screen points. */
  facing: number
  /** Console width along its own left-right axis. */
  width: number
  /** Hull number stencilled above the console. */
  bay: string
}

/**
 * Module scale follows the ISS US segment: Destiny is about 4.2 m across, with
 * roughly 2 m of clear space between the rack faces. These spans are a little
 * more generous so a walking camera is not scraping the deck-head, but they are
 * close enough that the cross-section reads as a pressurised module rather than
 * as a corridor in a building.
 */
export const ROOMS: Room[] = [
  { id: 'spine', label: 'Spine corridor', x0: -2.3, x1: 2.3, z0: -28.5, z1: 15, height: 2.75 },
  { id: 'command', label: 'Command module', x0: -5.6, x1: 5.6, z0: 15, z1: 23.5, height: 3.3, along: 'z' },
  { id: 'medical', label: 'Medical bay', x0: 2.3, x1: 8.4, z0: 4.6, z1: 11.4, height: 2.75 },
  { id: 'crew', label: 'Crew quarters', x0: -8.4, x1: -2.3, z0: 4.6, z1: 11.4, height: 2.75 },
  { id: 'environment', label: 'Environmental control', x0: 2.3, x1: 8.4, z0: -12.4, z1: -5.6, height: 2.75 },
  { id: 'comms', label: 'Communications', x0: -8.4, x1: -2.3, z0: -12.4, z1: -5.6, height: 2.75 },
  { id: 'research', label: 'Research module', x0: 2.3, x1: 9.2, z0: -25.6, z1: -17.8, height: 2.75 },
  { id: 'airlock', label: 'EVA preparation', x0: -8.4, x1: -2.3, z0: -25.6, z1: -17.8, height: 2.75 },
  // The crew lock: the chamber that is actually pumped down. Kept small, as
  // the real one is — it holds two suited crew and nothing else — and set
  // outboard of the preparation module so the two hatches are genuinely at
  // opposite ends of a space you walk through rather than either side of a
  // doorway.
  { id: 'chamber', label: 'Airlock chamber', x0: -11.6, x1: -8.4, z0: -23.4, z1: -20.0, height: 2.4, along: 'x' },
]

export const STATIONS: Station[] = [
  {
    id: 'navigation',
    label: 'Navigation',
    hint: 'Mission profile, elapsed time and the event timeline',
    // Set against the port wall rather than in front of the cupola: the window
    // is the reason to come to this module, and a console parked in the middle
    // of it would be standing in the view.
    x: -3.4,
    z: 20.4,
    facing: -Math.PI / 2,
    width: 3.2,
    bay: 'BAY 01 · NAV',
  },
  {
    id: 'medical',
    label: 'Medical bay',
    hint: 'Crew health, anomalies and the Signal Veil instrument',
    x: 7.5,
    z: 8,
    facing: Math.PI / 2,
    width: 2.9,
    bay: 'BAY 02 · MED',
  },
  {
    id: 'crew',
    label: 'Crew quarters',
    hint: 'Crew roster, sleep and activity',
    x: -7.5,
    z: 8,
    facing: -Math.PI / 2,
    width: 2.9,
    bay: 'BAY 03 · CRW',
  },
  {
    id: 'environment',
    label: 'Environmental control',
    hint: 'Cabin atmosphere and the mission scenario model',
    x: 7.5,
    z: -9,
    facing: Math.PI / 2,
    width: 2.9,
    bay: 'BAY 04 · ECLSS',
  },
  {
    id: 'comms',
    label: 'Communications',
    hint: 'Mission-control traffic and one-way light time',
    x: -7.5,
    z: -9,
    facing: -Math.PI / 2,
    width: 2.9,
    bay: 'BAY 05 · COMM',
  },
  {
    id: 'research',
    label: 'Research module',
    hint: 'Mission experiments and what the engine has found',
    x: 8.3,
    z: -21.7,
    facing: Math.PI / 2,
    width: 2.9,
    bay: 'BAY 06 · LAB',
  },
]

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Record<StationId, Station>

/** Where a crew member enters the deck, and which way they are looking. */
export const SPAWN = { x: 0, z: -2, yaw: Math.PI }

/**
 * The cupola: a seven-window observation structure set into the forward
 * bulkhead of the command module, after the ISS cupola — one circular centre
 * pane ringed by six trapezoidal ones.
 */
export const CUPOLA = { x: 0, y: 1.75, z: 23.5, radius: 2.05, depth: 0.85 }

/**
 * Hatches that can be shut.
 *
 * Every other wall in the vessel is implied: a surface exists wherever two
 * rectangles do not meet, and nothing moves. A hatch is the exception, because
 * its collision has to follow its state — the whole point of an airlock is
 * that a door you could walk through a moment ago now stops you.
 *
 * A door is a segment of a wall plus a span across it. Collision tests whether
 * a step crosses that plane inside that span, which is cheap and, more
 * importantly, is the same test the renderer uses to decide where to put the
 * leaf, so what you see and what stops you cannot drift apart.
 */
export interface Door {
  id: string
  /** The wall this hatch sits in: 'x' means the wall is at a constant x. */
  axis: 'x' | 'z'
  /** The wall's coordinate on that axis. */
  at: number
  /** The opening's extent along the other horizontal axis. */
  lo: number
  hi: number
  /** Which way the leaf swings open, for the renderer. */
  swing: 1 | -1
}

export const DOORS: Door[] = [
  // Preparation module into the chamber.
  { id: 'inner-hatch', axis: 'x', at: -8.4, lo: -22.6, hi: -20.8, swing: 1 },
  // Chamber out to vacuum. Nothing beyond it is walkable, so this one only
  // matters to the renderer and to the EVA egress check.
  { id: 'outer-hatch', axis: 'x', at: -11.6, lo: -22.6, hi: -20.8, swing: -1 },
]

export const DOOR_BY_ID = Object.fromEntries(DOORS.map((d) => [d.id, d])) as Record<string, Door>

/**
 * Does the step from one point to another pass through a shut hatch?
 * The body's radius is included so a crew member cannot stand half inside a
 * closing hatch and be pushed through it.
 */
function crossesShutDoor(
  fromX: number, fromZ: number, toX: number, toZ: number,
  radius: number, shut: ReadonlySet<string>,
): boolean {
  if (shut.size === 0) return false
  for (const d of DOORS) {
    if (!shut.has(d.id)) continue
    const f = d.axis === 'x' ? fromX : fromZ
    const t = d.axis === 'x' ? toX : toZ
    const across = d.axis === 'x' ? toZ : toX
    // Widen the plane by the body's radius on both sides.
    const lo = Math.min(f, t) - radius
    const hi = Math.max(f, t) + radius
    if (d.at < lo || d.at > hi) continue
    // Only blocks where the opening actually is; beyond its span it is wall,
    // which the room rectangles already handle.
    if (across < d.lo - radius || across > d.hi + radius) continue
    return true
  }
  return false
}

const EPS = 1e-6

export function roomAt(x: number, z: number): Room | null {
  for (const r of ROOMS) {
    if (x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS) return r
  }
  return null
}

/** True when the point is inside any compartment. */
export function inside(x: number, z: number): boolean {
  return roomAt(x, z) !== null
}

/**
 * Deck-head height at a point, so the command deck can be taller than the
 * spine without the renderer and the camera disagreeing.
 */
export function heightAt(x: number, z: number): number {
  return roomAt(x, z)?.height ?? 3.1
}

/**
 * Slide a body of the given radius from `from` toward `to`, keeping it inside
 * the deck. Axes resolve independently so that brushing a wall slides along it
 * instead of stopping dead, which is what makes the movement feel right rather
 * than sticky.
 */
export function moveWithCollision(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius: number,
  shutDoors: ReadonlySet<string> = EMPTY_DOORS,
): { x: number; z: number } {
  let x = fromX
  let z = fromZ
  // Try the x move, then the z move, each against the body's leading edge.
  const stepX = toX - fromX
  if (stepX !== 0) {
    const probe = x + stepX + Math.sign(stepX) * radius
    if (
      inside(probe, z) && inside(probe, z + radius) && inside(probe, z - radius) &&
      !crossesShutDoor(x, z, x + stepX, z, radius, shutDoors)
    ) x += stepX
  }
  const stepZ = toZ - fromZ
  if (stepZ !== 0) {
    const probe = z + stepZ + Math.sign(stepZ) * radius
    if (
      inside(x, probe) && inside(x + radius, probe) && inside(x - radius, probe) &&
      !crossesShutDoor(x, z, x, z + stepZ, radius, shutDoors)
    ) z += stepZ
  }
  return { x, z }
}

const EMPTY_DOORS: ReadonlySet<string> = new Set()

/**
 * The station a crew member is addressing: near enough, and roughly looked at.
 * Returning the station rather than a boolean lets the prompt name it.
 */
export function stationInReach(x: number, z: number, yaw: number, range = 3.4): Station | null {
  let best: Station | null = null
  let bestScore = -Infinity
  for (const s of STATIONS) {
    const dx = s.x - x
    const dz = s.z - z
    const dist = Math.hypot(dx, dz)
    if (dist > range) continue
    // Forward is -sin(yaw), -cos(yaw) to match the camera basis below.
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const facing = (dx * fx + dz * fz) / (dist || 1)
    if (facing < 0.35) continue // behind, or well off to the side
    const score = facing - dist * 0.1
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}
