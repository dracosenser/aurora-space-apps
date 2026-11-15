import { describe, expect, it } from 'vitest'
import { ROOMS, SPAWN, STATIONS, heightAt, inside, moveWithCollision, stationInReach } from '../model/deck'

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
    const start = { x: 2.9, z: 0 }
    const next = moveWithCollision(start.x, start.z, start.x + 0.1, start.z + 0.1, RADIUS)
    expect(next.z).toBeGreaterThan(start.z)
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
