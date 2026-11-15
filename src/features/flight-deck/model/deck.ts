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
}

export type StationId = 'navigation' | 'medical' | 'crew' | 'environment' | 'comms'

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

export const ROOMS: Room[] = [
  { id: 'spine', label: 'Spine corridor', x0: -3, x1: 3, z0: -16, z1: 15, height: 3.1 },
  { id: 'command', label: 'Command deck', x0: -8.5, x1: 8.5, z0: 15, z1: 24, height: 3.8 },
  { id: 'medical', label: 'Medical bay', x0: 3, x1: 10.5, z0: 4, z1: 12, height: 3.1 },
  { id: 'crew', label: 'Crew quarters', x0: -10.5, x1: -3, z0: 4, z1: 12, height: 3.1 },
  { id: 'environment', label: 'Environmental control', x0: 3, x1: 10.5, z0: -13, z1: -5, height: 3.1 },
  { id: 'comms', label: 'Communications', x0: -10.5, x1: -3, z0: -13, z1: -5, height: 3.1 },
]

export const STATIONS: Station[] = [
  {
    id: 'navigation',
    label: 'Navigation',
    hint: 'Mission profile, elapsed time and the event timeline',
    x: 0,
    z: 22.4,
    facing: 0, // back to the bow wall, screen toward the spine
    width: 4.2,
    bay: 'BAY 01 · NAV',
  },
  {
    id: 'medical',
    label: 'Medical bay',
    hint: 'Crew health, anomalies and the Signal Veil instrument',
    x: 9.6,
    z: 8,
    facing: Math.PI / 2,
    width: 3.6,
    bay: 'BAY 02 · MED',
  },
  {
    id: 'crew',
    label: 'Crew quarters',
    hint: 'Crew roster, sleep and activity',
    x: -9.6,
    z: 8,
    facing: -Math.PI / 2,
    width: 3.6,
    bay: 'BAY 03 · CRW',
  },
  {
    id: 'environment',
    label: 'Environmental control',
    hint: 'Cabin atmosphere and the mission scenario model',
    x: 9.6,
    z: -9,
    facing: Math.PI / 2,
    width: 3.6,
    bay: 'BAY 04 · ECLSS',
  },
  {
    id: 'comms',
    label: 'Communications',
    hint: 'Mission-control traffic and one-way light time',
    x: -9.6,
    z: -9,
    facing: -Math.PI / 2,
    width: 3.6,
    bay: 'BAY 05 · COMM',
  },
]

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Record<StationId, Station>

/** Where a crew member enters the deck, and which way they are looking. */
export const SPAWN = { x: 0, z: -2, yaw: Math.PI }

/** The bow window occupies the forward wall of the command deck. */
export const WINDOW = { x0: -6.4, x1: 6.4, y0: 1.0, y1: 2.9, z: 24 }

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
): { x: number; z: number } {
  let x = fromX
  let z = fromZ
  // Try the x move, then the z move, each against the body's leading edge.
  const stepX = toX - fromX
  if (stepX !== 0) {
    const probe = x + stepX + Math.sign(stepX) * radius
    if (inside(probe, z) && inside(probe, z + radius) && inside(probe, z - radius)) x += stepX
  }
  const stepZ = toZ - fromZ
  if (stepZ !== 0) {
    const probe = z + stepZ + Math.sign(stepZ) * radius
    if (inside(x, probe) && inside(x + radius, probe) && inside(x - radius, probe)) z += stepZ
  }
  return { x, z }
}

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
