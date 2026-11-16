import { describe, expect, it } from 'vitest'
import { ROOMS, SPAWN, STATIONS, heightAt, inside, moveWithCollision, stationInReach } from '../model/deck'
import { ALL_TASKS, KNOWN_TASKS, OBJECTIVES, currentObjective, objectiveDone, type TaskId } from '../model/objectives'

const RADIUS = 0.42

/** Where a crew member stands to use a console, and the yaw that faces it. */
function approach(s: (typeof STATIONS)[number]) {
  const dx = Math.sin(s.facing)
  const dz = Math.cos(s.facing)
  return { x: s.x - dx * 2.0, z: s.z - dz * 2.0, yaw: Math.atan2(-dx, -dz) }
}

/** Greedy walk toward a point, sliding along walls, as the player would. */
function walk(fromX: number, fromZ: number, toX: number, toZ: number) {
  let x = fromX
  let z = fromZ
  let stuck = 0
  for (let i = 0; i < 4000; i++) {
    const dx = toX - x
    const dz = toZ - z
    const d = Math.hypot(dx, dz)
    if (d < 0.12) break
    const step = Math.min(0.08, d)
    const next = moveWithCollision(x, z, x + (dx / d) * step, z + (dz / d) * step, RADIUS)
    if (Math.hypot(next.x - x, next.z - z) < 1e-4) {
      if (++stuck > 60) break
    } else stuck = 0
    x = next.x
    z = next.z
  }
  return { x, z }
}

describe('deck plan', () => {
  it('spawns the crew member inside the vessel', () => {
    expect(inside(SPAWN.x, SPAWN.z)).toBe(true)
  })

  it('treats points outside the hull as outside', () => {
    expect(inside(0, -40)).toBe(false)
    expect(inside(40, 0)).toBe(false)
    expect(inside(0, 100)).toBe(false)
  })

  it('gives the command deck more head height than the spine', () => {
    expect(heightAt(0, 20)).toBeGreaterThan(heightAt(0, 0))
  })
})

describe('collision', () => {
  it('never lets a crew member leave the deck, from any room in any direction', () => {
    const escapes: string[] = []
    for (const r of ROOMS) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        let x = (r.x0 + r.x1) / 2
        let z = (r.z0 + r.z1) / 2
        for (let i = 0; i < 2000; i++) {
          const n = moveWithCollision(x, z, x + dx * 0.08, z + dz * 0.08, RADIUS)
          x = n.x
          z = n.z
        }
        if (!inside(x, z)) escapes.push(`${r.id} heading ${dx},${dz}`)
      }
    }
    expect(escapes).toEqual([])
  })

  it('slides along a wall rather than stopping dead', () => {
    // Push diagonally into the spine's starboard wall: the z component should
    // still carry, otherwise brushing a wall would halt all movement.
    //
    // The start point is derived from the deck plan rather than written in.
    // It used to be a literal, and when the spine was narrowed that literal
    // ended up outside the hull, where nothing can move in any direction and
    // the assertion failed for a reason that had nothing to do with sliding.
    const spine = ROOMS.find((r) => r.id === 'spine')!
    const start = { x: spine.x1 - RADIUS - 0.02, z: 0 }
    expect(inside(start.x, start.z), 'the start point must be inside the hull').toBe(true)
    const next = moveWithCollision(start.x, start.z, start.x + 0.1, start.z + 0.1, RADIUS)
    expect(next.z, 'the z component should carry while x is blocked').toBeGreaterThan(start.z)
    expect(next.x, 'the x component should be blocked by the wall').toBeCloseTo(start.x, 6)
  })
})

describe('navigability', () => {
  it.each(STATIONS.map((s) => [s.label, s] as const))('can walk from the spawn to %s', (_label, s) => {
    const a = approach(s)
    // Via the spine, which is how the deck is actually laid out.
    const mid = walk(SPAWN.x, SPAWN.z, 0, a.z)
    const end = walk(mid.x, mid.z, a.x, a.z)
    expect(Math.hypot(a.x - end.x, a.z - end.z)).toBeLessThan(0.5)
  })

  it.each(STATIONS.map((s) => [s.label, s] as const))('prompts at %s when stood at it and facing it', (_label, s) => {
    const a = approach(s)
    expect(stationInReach(a.x, a.z, a.yaw)?.id).toBe(s.id)
  })

  it('does not prompt when facing away from a console', () => {
    const s = STATIONS[0]
    const a = approach(s)
    expect(stationInReach(a.x, a.z, a.yaw + Math.PI)).toBeNull()
  })

  it('does not prompt from across the vessel', () => {
    const s = STATIONS[0]
    const a = approach(s)
    expect(stationInReach(a.x, a.z - 12, a.yaw)).toBeNull()
  })

  it('gives every station a distinct bay number', () => {
    expect(new Set(STATIONS.map((s) => s.bay)).size).toBe(STATIONS.length)
  })
})

// ---------------------------------------------------------------------------
// Console zoom and mission objectives
// ---------------------------------------------------------------------------

/** Mirror of screenPose in FlightDeck.tsx: where the camera reads a console. */
function screenPose(s: (typeof STATIONS)[number]) {
  const bx = Math.sin(s.facing)
  const bz = Math.cos(s.facing)
  return { x: s.x - bx * 1.04, y: 1.3, z: s.z - bz * 1.04, yaw: Math.atan2(-bx, -bz) }
}

describe('console zoom', () => {
  it.each(STATIONS.map((s) => [s.label, s] as const))('puts the camera inside the module at %s', (_l, s) => {
    const p = screenPose(s)
    expect(inside(p.x, p.z)).toBe(true)
    expect(p.y).toBeLessThan(heightAt(p.x, p.z) - 0.2)
  })

  it.each(STATIONS.map((s) => [s.label, s] as const))('faces the screen squarely at %s', (_l, s) => {
    const p = screenPose(s)
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    const dx = s.x - p.x
    const dz = s.z - p.z
    const d = Math.hypot(dx, dz)
    expect((dx / d) * fx + (dz / d) * fz).toBeGreaterThan(0.999)
    expect(d).toBeGreaterThan(0.9)
    expect(d).toBeLessThan(1.2)
  })

  it.each(STATIONS.map((s) => [s.label, s] as const))('keeps %s the station in reach while zoomed', (_l, s) => {
    const p = screenPose(s)
    expect(stationInReach(p.x, p.z, p.yaw)?.id).toBe(s.id)
  })
})

describe('mission objectives', () => {
  it('has unique task ids', () => {
    expect(new Set(ALL_TASKS).size).toBe(ALL_TASKS.length)
  })

  it('never completes an objective by merely opening a console', () => {
    const arriveOnly = OBJECTIVES.filter((o) => o.tasks.every((t) => t.id.startsWith('open-')))
    expect(arriveOnly).toEqual([])
  })

  it('needs more than one action per objective', () => {
    for (const o of OBJECTIVES) expect(o.tasks.length).toBeGreaterThan(1)
  })

  it('does not complete an objective from one of its tasks', () => {
    const first = OBJECTIVES[0]
    expect(objectiveDone(first, [first.tasks[0].id])).toBe(false)
    expect(objectiveDone(first, first.tasks.map((t) => t.id))).toBe(true)
  })

  it('walks the briefing from the first objective to none left', () => {
    expect(currentObjective([])?.code).toBe('OBJ-01')
    expect(currentObjective(ALL_TASKS)).toBeNull()
  })

  it('persists every task the station can report, not only objective ones', () => {
    for (const t of ['open-navigation', 'open-comms'] as TaskId[]) expect(KNOWN_TASKS).toContain(t)
  })
})
