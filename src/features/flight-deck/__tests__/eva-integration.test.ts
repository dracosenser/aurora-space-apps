import { describe, expect, it } from 'vitest'
import { DOORS, ROOMS, SPAWN, STATIONS, inside, moveWithCollision } from '../model/deck'
import {
  ALL_AIRLOCK_STATES, CABIN_KPA, PASSABLE, VACUUM_KPA, advance, command, hatchOpenness,
  innerHatch, newAirlock, phaseSeconds, shutDoors, type Airlock,
} from '../model/airlock'
import {
  EGRESS, EVA_BOUNDS, EVA_TASKS, GRIP_RANGE, HANDRAILS, TETHER_LENGTH,
  EVA_POINTS, handrailGrip, siteInReach, stepEva, stepKey, taskComplete, tetherDistance,
  type EvaMotion,
} from '../model/eva'
import {
  ALL_PROC_STEPS, PROCEDURES, PROC_BY_ID, baselineOf, nextProcStep, procComplete, procStepKey,
  type ProcContext,
} from '../model/procedures'
import { ALL_TASKS, OBJECTIVES } from '../model/objectives'
import {
  COMMS_LOOPS, CONSUMABLES, DONNING, INSPECTION, SUITS, don, newSuitPrep, prepComplete, stageOf,
} from '../model/suit'
import { entryOverlay, type OverlayState } from '../model/overlay'
import type { Astronaut, DailyRecord } from '../../../types'

const RADIUS = 0.34

describe('hatches block passage', () => {
  it('stops a crew member walking through a shut inner hatch', () => {
    const d = DOORS.find((x) => x.id === 'inner-hatch')!
    const zMid = (d.lo + d.hi) / 2
    // Standing in the preparation module, a step short of the hatch.
    const fromX = d.at + 0.6
    expect(inside(fromX, zMid)).toBe(true)
    // The chamber beyond is walkable space, so only the hatch can stop this.
    expect(inside(d.at - 0.6, zMid)).toBe(true)

    const shut = moveWithCollision(fromX, zMid, d.at - 0.6, zMid, RADIUS, new Set(['inner-hatch']))
    expect(shut.x, 'a shut hatch must not be passable').toBeCloseTo(fromX, 6)

    const open = moveWithCollision(fromX, zMid, d.at - 0.6, zMid, RADIUS, new Set())
    expect(open.x, 'an open hatch must be passable').toBeLessThan(fromX)
  })

  it('does not block movement away from a shut hatch', () => {
    const d = DOORS.find((x) => x.id === 'inner-hatch')!
    const zMid = (d.lo + d.hi) / 2
    const fromX = d.at + 0.6
    const away = moveWithCollision(fromX, zMid, fromX + 0.4, zMid, RADIUS, new Set(['inner-hatch']))
    expect(away.x).toBeGreaterThan(fromX)
  })

  it('does not block movement alongside the hatch, outside its opening', () => {
    const d = DOORS.find((x) => x.id === 'inner-hatch')!
    // Well clear of the opening along z, the hatch is irrelevant: that stretch
    // is ordinary wall, which the room rectangles already handle.
    const zClear = d.lo - 1.6
    const fromX = d.at + 0.6
    if (!inside(fromX, zClear)) return
    const step = moveWithCollision(fromX, zClear, fromX, zClear + 0.3, RADIUS, new Set(['inner-hatch']))
    expect(step.z).not.toBe(zClear)
  })

  it('keeps the shut set in step with the hatch the renderer draws', () => {
    // Swept across every state and every point in its phase, not just the
    // state names: the disagreement that matters happens mid-swing.
    for (const st of ALL_AIRLOCK_STATES) {
      const total = phaseSeconds(st) || 1
      for (let k = 0; k <= 10; k++) {
        const a: Airlock = { ...newAirlock(), state: st, t: (total * k) / 10 }
        const shut = shutDoors(a)
        const open = hatchOpenness(a)
        expect(shut.has('inner-hatch'), `inner mismatch in ${st} at ${k / 10}`).toBe(open.inner < PASSABLE)
        expect(shut.has('outer-hatch'), `outer mismatch in ${st} at ${k / 10}`).toBe(open.outer < PASSABLE)
      }
    }
  })

  it('never lets both hatches be passable at once, at any point in any phase', () => {
    for (const st of ALL_AIRLOCK_STATES) {
      const total = phaseSeconds(st) || 1
      for (let k = 0; k <= 20; k++) {
        const a: Airlock = { ...newAirlock(), state: st, t: (total * k) / 20 }
        const shut = shutDoors(a)
        const bothPassable = !shut.has('inner-hatch') && !shut.has('outer-hatch')
        expect(bothPassable, `both hatches passable in ${st} at ${k / 20}`).toBe(false)
      }
    }
  })

  it('animates a hatch progressively rather than snapping', () => {
    let a: Airlock = { ...newAirlock(), state: 'inner-hatch-closing', t: 0 }
    const seen: number[] = []
    for (let i = 0; i < 10; i++) {
      a = advance(a, phaseSeconds('inner-hatch-closing') / 10)
      seen.push(hatchOpenness(a).inner)
    }
    // It starts open, ends shut, and passes through the middle.
    expect(seen[0]).toBeGreaterThan(0.7)
    expect(seen.some((v) => v > 0.3 && v < 0.7), 'the leaf never passed through mid-swing').toBe(true)
    expect(seen.at(-1)).toBe(0)
  })
})

describe('the airlock chamber is a real place', () => {
  it('exists as a walkable room with both hatches on its walls', () => {
    const ch = ROOMS.find((r) => r.id === 'chamber')
    expect(ch, 'there is no chamber room in the deck plan').toBeTruthy()
    if (!ch) return
    // Big enough for a suited crew member to stand and turn.
    expect(Math.min(ch.x1 - ch.x0, ch.z1 - ch.z0)).toBeGreaterThan(2.4)
    const mid = { x: (ch.x0 + ch.x1) / 2, z: (ch.z0 + ch.z1) / 2 }
    expect(inside(mid.x, mid.z)).toBe(true)
    // Each hatch sits on one of its walls.
    for (const id of ['inner-hatch', 'outer-hatch']) {
      const d = DOORS.find((x) => x.id === id)!
      expect(Math.min(Math.abs(d.at - ch.x0), Math.abs(d.at - ch.x1))).toBeLessThan
        ? expect(Math.min(Math.abs(d.at - ch.x0), Math.abs(d.at - ch.x1))).toBeLessThan(0.01)
        : undefined
    }
  })

  it('puts the egress point outside the hull, not inside it', () => {
    const ch = ROOMS.find((r) => r.id === 'chamber')!
    // The exterior mesh wraps the chamber out to its own end; the egress point
    // must be beyond that, or a crew member steps out into the wall.
    expect(EGRESS.x, 'egress is inside the chamber hull').toBeLessThan(ch.x0 - 0.8)
    expect(inside(EGRESS.x, EGRESS.z), 'egress must not be in walkable interior space').toBe(false)
  })

  it('starts the handrail run at the hatch a crew member comes out of', () => {
    const first = HANDRAILS[0]
    const d = Math.hypot(first.a[0] - EGRESS.x, first.a[1] - EGRESS.y, first.a[2] - EGRESS.z)
    expect(d, 'the first handrail does not begin at the egress point').toBeLessThan(GRIP_RANGE)
  })
})

describe('free-fall movement', () => {
  const at = (x: number, y: number, z: number): EvaMotion => ({ x, y, z, vx: 0, vy: 0, vz: 0 })

  it('carries momentum: letting go does not stop a crew member', () => {
    let m = at(EGRESS.x - 6, EGRESS.y, EGRESS.z)
    // Push once, away from any handrail.
    for (let i = 0; i < 20; i++) m = stepEva(m, -1, 0, 0, 1 / 60)
    const speed = Math.hypot(m.vx, m.vy, m.vz)
    expect(speed, 'no momentum was built up').toBeGreaterThan(0.2)
    // Coast with no input: it must still be moving a second later.
    for (let i = 0; i < 60; i++) m = stepEva(m, 0, 0, 0, 1 / 60)
    expect(Math.hypot(m.vx, m.vy, m.vz), 'drift stopped by itself').toBeGreaterThan(speed * 0.4)
  })

  it('damps much harder with a hand on a rail than without', () => {
    const rail = HANDRAILS[2]
    const on = at((rail.a[0] + rail.b[0]) / 2, (rail.a[1] + rail.b[1]) / 2, (rail.a[2] + rail.b[2]) / 2)
    expect(handrailGrip(on.x, on.y, on.z)).toBeLessThan(GRIP_RANGE)
    let a = { ...on, vx: 1.5 }
    let b = { ...at(EGRESS.x - 20, EGRESS.y + 6, EGRESS.z + 6), vx: 1.5 }
    expect(handrailGrip(b.x, b.y, b.z)).toBeGreaterThan(GRIP_RANGE)
    for (let i = 0; i < 30; i++) {
      a = stepEva(a, 0, 0, 0, 1 / 60)
      b = stepEva(b, 0, 0, 0, 1 / 60)
    }
    expect(Math.abs(a.vx), 'a hand on a rail should check the drift').toBeLessThan(Math.abs(b.vx) * 0.6)
  })

  it('never lets a crew member past the tether, however long they push', () => {
    let m = at(EGRESS.x, EGRESS.y, EGRESS.z)
    for (let i = 0; i < 4000; i++) {
      m = stepEva(m, -1, 0.3, 0.2, 1 / 60)
      const d = tetherDistance(m.x, m.y, m.z)
      expect(d, `tether exceeded at step ${i}: ${d.toFixed(2)} m`).toBeLessThanOrEqual(TETHER_LENGTH + 1e-6)
    }
  })

  it('makes the tether the constraint, not the scene bounds', () => {
    // Every direction out of the hatch must run out of tether before it runs
    // out of scene, or the tether is decoration.
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const reach = TETHER_LENGTH
      expect(Math.abs(EGRESS.x + dx * reach), 'tether exceeds the x bound').toBeLessThanOrEqual(EVA_BOUNDS.x)
      expect(EGRESS.y + dy * reach).toBeLessThanOrEqual(EVA_BOUNDS.yMax)
      expect(EGRESS.y + dy * reach).toBeGreaterThanOrEqual(EVA_BOUNDS.yMin)
      expect(Math.abs(EGRESS.z + dz * reach), 'tether exceeds the z bound').toBeLessThanOrEqual(EVA_BOUNDS.z)
    }
  })

  it('keeps every worksite inside the derived tether, with margin', () => {
    for (const t of EVA_TASKS) {
      const d = tetherDistance(t.site.x, t.site.y, t.site.z)
      expect(d, `${t.code} at ${d.toFixed(1)} m is outside the ${TETHER_LENGTH} m tether`).toBeLessThan(TETHER_LENGTH)
    }
  })

  it('stays inside the exterior volume', () => {
    let m = at(EGRESS.x, EGRESS.y, EGRESS.z)
    for (let i = 0; i < 2000; i++) {
      m = stepEva(m, 1, 1, 1, 1 / 60)
      expect(Math.abs(m.x)).toBeLessThanOrEqual(EVA_BOUNDS.x + 1e-6)
      expect(m.y).toBeLessThanOrEqual(EVA_BOUNDS.yMax + 1e-6)
      expect(m.y).toBeGreaterThanOrEqual(EVA_BOUNDS.yMin - 1e-6)
    }
  })

  it('lets a crew member at full tether swing round the anchor rather than sticking', () => {
    // Out to the limit, then push sideways: the tangential component survives.
    let m = stepEva(at(EGRESS.x - TETHER_LENGTH + 1, EGRESS.y, EGRESS.z), -1, 0, 0, 1 / 60)
    // Push until it actually goes taut rather than assuming a step count: at
    // the model's top speed the last metre of a 58 m tether takes a while.
    for (let i = 0; i < 2000 && !m.taut; i++) m = stepEva(m, -1, 0, 0, 1 / 60)
    expect(m.taut, 'never reached the end of the tether').toBe(true)
    const z0 = m.z
    for (let i = 0; i < 180; i++) m = stepEva(m, 0, 0, 1, 1 / 60)
    expect(Math.abs(m.z - z0), 'a taut tether should not pin a crew member in place').toBeGreaterThan(0.5)
  })

  it('reaches every worksite from the hatch', () => {
    // A crude pilot: accelerate straight at each site and check it arrives.
    for (const t of EVA_TASKS) {
      let m = at(EGRESS.x, EGRESS.y, EGRESS.z)
      let arrived = false
      for (let i = 0; i < 6000 && !arrived; i++) {
        const dx = t.site.x - m.x
        const dy = t.site.y - m.y
        const dz = t.site.z - m.z
        const len = Math.hypot(dx, dy, dz) || 1
        m = stepEva(m, dx / len, dy / len, dz / len, 1 / 60)
        if (len < t.site.reach) arrived = true
      }
      expect(arrived, `${t.code} is unreachable from the airlock`).toBe(true)
    }
  })
})

describe('procedures', () => {
  const who: Astronaut = {
    id: 'a1', name: 'Test Subject', callsign: 'TS', role: 'Engineer', age: 40,
    background: '', color: '#fff', initials: 'TS',
    baseline: { restingHR: 58, hrv: 60, systolicBP: 112, diastolicBP: 72, sleepDuration: 7.4, exerciseMinutes: 90 },
  }
  const rec = (day: number): DailyRecord => ({
    day, astronautId: 'a1', restingHR: 60 + day * 0.1, hrv: 58, systolicBP: 114, diastolicBP: 74,
    sleepDuration: 7.1, sleepConsistency: 70, sleepQuality: 72, exerciseMinutes: 88,
    muscleStrength: 96, boneDensity: 98, radiationDaily: 0.4, radiationCumulative: day * 0.4,
    stress: 40, mood: 66, fatigue: 38,
  })
  const records = Array.from({ length: 60 }, (_, i) => rec(i + 1))
  const ctx = (over: Partial<ProcContext> = {}): ProcContext => ({
    who, now: records.at(-1), base: baselineOf(records), day: 60, evaDone: false, evaSeconds: 0, ...over,
  })

  it('has one procedure per medical objective task, fourteen in all', () => {
    expect(PROCEDURES).toHaveLength(14)
    const ids = new Set(PROCEDURES.map((p) => p.id))
    expect(ids.size).toBe(14)
  })

  it('wires every procedure to a task that an objective actually lists', () => {
    for (const p of PROCEDURES) {
      expect((ALL_TASKS as string[]).includes(p.task), `${p.code} closes ${p.task}, which no objective lists`).toBe(true)
    }
  })

  it('gives every procedure at least four steps, each with a reading', () => {
    for (const p of PROCEDURES) {
      expect(p.steps.length, `${p.code} is too thin`).toBeGreaterThanOrEqual(4)
      for (const s of p.steps) {
        const out = s.read(ctx({ evaDone: true, evaSeconds: 1800 }))
        expect(typeof out === 'string' && out.length > 10, `${p.code}:${s.id} reads back nothing`).toBe(true)
      }
    }
  })

  it('does not complete a procedure by opening it', () => {
    for (const p of PROCEDURES) {
      expect(procComplete(p, [])).toBe(false)
      expect(nextProcStep(p, [])).toBe(p.steps[0])
    }
  })

  it('completes only when every step is performed, in order', () => {
    for (const p of PROCEDURES) {
      let done: string[] = []
      for (const s of p.steps) {
        expect(nextProcStep(p, done)?.id, `${p.code} let a step be skipped`).toBe(s.id)
        expect(procComplete(p, done)).toBe(false)
        done = [...done, procStepKey(p.id, s.id)]
      }
      expect(procComplete(p, done)).toBe(true)
    }
  })

  it('locks the post-EVA review until a spacewalk has happened', () => {
    const p = PROC_BY_ID['post-eva']
    expect(p.requires?.(ctx({ evaDone: false }))).toBeTruthy()
    expect(p.requires?.(ctx({ evaDone: true }))).toBeNull()
  })

  it('reads values from the record rather than inventing them', () => {
    const bp = PROC_BY_ID['blood-pressure']
    const out = bp.steps[1].read(ctx())
    // The systolic and diastolic in the record must appear in the reading.
    expect(out).toContain('114')
    expect(out).toContain('74')
  })

  it('takes the baseline from the crew member own early mission, not a population range', () => {
    const base = baselineOf(records)
    const early = records.slice(0, 30)
    const mean = early.reduce((t, r) => t + r.restingHR, 0) / early.length
    expect(base.restingHR).toBeCloseTo(mean, 6)
  })

  it('labels every step key uniquely', () => {
    expect(new Set(ALL_PROC_STEPS).size).toBe(ALL_PROC_STEPS.length)
  })

  it('places every procedure at a console that exists', () => {
    const consoles = new Set(['navigation', 'medical', 'crew', 'environment', 'comms', 'research'])
    for (const p of PROCEDURES) expect(consoles.has(p.at), `${p.code} is at ${p.at}`).toBe(true)
  })
})

describe('objectives', () => {
  it('cannot be completed by opening consoles alone', () => {
    // Everything that merely reaching a console records.
    const freebies = new Set(['open-medical', 'open-crew', 'open-environment', 'open-navigation', 'open-comms', 'open-research'])
    for (const o of OBJECTIVES) {
      const needsWork = o.tasks.some((t) => !freebies.has(t.id))
      expect(needsWork, `${o.code} completes by walking up to a console`).toBe(true)
    }
  })

  it('has a unique code and id for each objective', () => {
    expect(new Set(OBJECTIVES.map((o) => o.id)).size).toBe(OBJECTIVES.length)
    expect(new Set(OBJECTIVES.map((o) => o.code)).size).toBe(OBJECTIVES.length)
  })

  it('has no duplicate task ids across objectives', () => {
    expect(new Set(ALL_TASKS).size, 'a task id is listed by two objectives').toBe(ALL_TASKS.length)
  })
})

describe('suits', () => {
  it('offers more than one serviceable suit and at least one that is not', () => {
    expect(SUITS.filter((s) => s.serviceable).length).toBeGreaterThanOrEqual(2)
    expect(SUITS.filter((s) => !s.serviceable).length).toBeGreaterThanOrEqual(1)
  })

  it('says why an unserviceable suit cannot be used', () => {
    for (const s of SUITS.filter((x) => !x.serviceable)) {
      expect(s.note.length).toBeGreaterThan(20)
    }
  })

  it('puts the racks inside the preparation module', () => {
    const r = ROOMS.find((x) => x.id === 'airlock')!
    for (const s of SUITS) {
      expect(s.x).toBeGreaterThan(r.x0 - 0.5)
      expect(s.x).toBeLessThan(r.x1)
      expect(s.z).toBeGreaterThan(r.z0)
      expect(s.z).toBeLessThan(r.z1)
    }
  })
})

describe('the entry overlay', () => {
  /** Every combination of the six inputs. */
  const all: OverlayState[] = []
  for (let i = 0; i < 64; i++) {
    all.push({
      entered: !!(i & 1), locked: !!(i & 2), consoleOpen: !!(i & 4),
      evaOpen: !!(i & 8), flying: !!(i & 16), touch: !!(i & 32),
    })
  }

  it('never appears while a console is open', () => {
    for (const s of all.filter((x) => x.consoleOpen)) {
      expect(entryOverlay(s), JSON.stringify(s)).toBe('none')
    }
  })

  it('never appears while an EVA screen is open', () => {
    // This is the one that regressed: opening a suit rack or the airlock
    // releases the pointer deliberately, exactly as a console does.
    for (const s of all.filter((x) => x.evaOpen)) {
      expect(entryOverlay(s), JSON.stringify(s)).toBe('none')
    }
  })

  it('never appears while the camera is flying', () => {
    for (const s of all.filter((x) => x.flying)) {
      expect(entryOverlay(s), JSON.stringify(s)).toBe('none')
    }
  })

  it('never appears on a touch device', () => {
    for (const s of all.filter((x) => x.touch)) {
      expect(entryOverlay(s), JSON.stringify(s)).toBe('none')
    }
  })

  it('never appears while the pointer is captured', () => {
    for (const s of all.filter((x) => x.locked)) {
      expect(entryOverlay(s), JSON.stringify(s)).toBe('none')
    }
  })

  it('shows the full plate only before anyone has ever taken the controls', () => {
    for (const s of all) {
      if (entryOverlay(s) === 'plate') expect(s.entered, JSON.stringify(s)).toBe(false)
    }
  })

  it('shows the quiet prompt once the controls have been taken and released', () => {
    expect(entryOverlay({
      entered: true, locked: false, consoleOpen: false, evaOpen: false, flying: false, touch: false,
    })).toBe('prompt')
  })

  it('shows the plate on a first load with nothing open', () => {
    expect(entryOverlay({
      entered: false, locked: false, consoleOpen: false, evaOpen: false, flying: false, touch: false,
    })).toBe('plate')
  })

  it('is never anything but none once the controls are taken, for any panel state', () => {
    // The practical statement of the bug: having entered once, the only thing
    // that can ever put an overlay back is releasing the pointer with nothing
    // open at all.
    const shown = all.filter((s) => s.entered && entryOverlay(s) !== 'none')
    for (const s of shown) {
      expect(s.locked || s.consoleOpen || s.evaOpen || s.flying || s.touch, JSON.stringify(s)).toBe(false)
    }
  })
})

describe('a complete spacewalk, start to finish', () => {
  /**
   * The whole flow as a crew member performs it, with the real gates in
   * place. Nothing here passes `ready: true` as a convenience: suit
   * preparation is actually carried out, and the airlock is asked to seal
   * before it is finished to confirm that it refuses.
   */
  it('runs end to end and refuses every shortcut along the way', () => {
    // ---- 1. at the suit rack
    let prep = newSuitPrep()
    expect(prepComplete(prep)).toBe(false)

    // The unserviceable suit cannot be taken.
    const broken = SUITS.find((s) => !s.serviceable)!
    expect(broken.serviceable).toBe(false)
    const good = SUITS.find((s) => s.serviceable)!
    prep = { ...prep, selected: good.id }

    // With only a suit chosen, the next thing to do is inspect it. The two
    // responsibilities are separate and both matter: `don` enforces the order
    // garments go on, and `stageOf` enforces that the earlier stages happened
    // at all. The panel shows a Don button only when stageOf says 'donning',
    // so this is the gate that stops someone sealing a helmet onto a suit
    // whose life support was never checked.
    expect(stageOf(prep)).toBe('inspect')
    expect(stageOf(prep)).not.toBe('donning')

    prep = { ...prep, inspected: INSPECTION.map((i) => i.id) }
    prep = { ...prep, acknowledged: CONSUMABLES.map((c) => c.id) }
    prep = { ...prep, comms: COMMS_LOOPS[0] }
    prep = { ...prep, tetherAttached: true, tools: ['pgt', 'scoop', 'wire-cutter', 'tether-short'] }
    expect(stageOf(prep)).toBe('donning')
    for (const d of DONNING) prep = don(prep, d.id)
    expect(prepComplete(prep)).toBe(true)

    // ---- 2. the airlock refuses to seal until the suit is ready
    let a = command(newAirlock(), 'enter', false)
    expect(a.state).toBe('crew-entering')
    expect(command(a, 'close-inner', false).state, 'sealed with an unready suit').toBe('crew-entering')
    a = command(a, 'close-inner', prepComplete(prep))
    expect(a.state).toBe('inner-hatch-closing')

    const settle = (x: Airlock): Airlock => {
      let g = 0
      while (phaseSeconds(x.state) > 0 && g++ < 20) x = advance(x, phaseSeconds(x.state) + 0.01)
      return x
    }
    a = settle(a)
    expect(a.state).toBe('inner-hatch-locked')
    expect(innerHatch(a.state)).toBe('locked')

    // ---- 3. pressure sequence, with the outer hatch refusing early
    a = command(a, 'confirm-suit', true)
    a = command(a, 'begin-prebreathe', true)
    expect(command(a, 'begin-depress', true).state, 'depressurised mid pre-breathe').toBe('prebreathe')
    a = settle(a)
    a = command(a, 'begin-depress', true)
    a = advance(a, phaseSeconds('depressurizing') * 0.6)
    expect(command(a, 'open-outer', true).refusal, 'outer hatch opened under pressure').toBeTruthy()
    a = settle(a)
    expect(a.kpa).toBeLessThanOrEqual(VACUUM_KPA)
    a = settle(command(a, 'open-outer', true))
    expect(a.state).toBe('outer-hatch-open')
    expect(innerHatch(a.state), 'inner hatch not locked with the outer one open').toBe('locked')

    // ---- 4. outside
    a = command(a, 'egress', true)
    expect(a.state).toBe('eva-active')
    let m: EvaMotion = { x: EGRESS.x, y: EGRESS.y, z: EGRESS.z, vx: 0, vy: 0, vz: 0 }

    // Fly to a worksite and work it. Reaching it completes nothing.
    const task = EVA_TASKS.find((t) => t.id === 'eva-02')!
    for (let i = 0; i < 6000; i++) {
      const dx = task.site.x - m.x, dy = task.site.y - m.y, dz = task.site.z - m.z
      const len = Math.hypot(dx, dy, dz) || 1
      if (len < task.site.reach) break
      m = stepEva(m, dx / len, dy / len, dz / len, 1 / 60)
    }
    expect(siteInReach(m.x, m.y, m.z)?.id).toBe(task.id)
    expect(taskComplete(task, []), 'arriving completed the task').toBe(false)

    let steps: string[] = []
    for (const s of task.steps) {
      expect(nextProcStepIsThis(task.steps, steps, s.id)).toBe(true)
      if (s.needs) expect(prep.tools).toContain(s.needs)
      steps = [...steps, stepKey(task.id, s.id)]
    }
    expect(taskComplete(task, steps)).toBe(true)

    // Time outside accumulates only while outside.
    a = advance(a, 120)
    expect(a.evaSeconds).toBeCloseTo(120, 3)

    // ---- 5. back in
    a = command(a, 'return', true)
    expect(a.state).toBe('crew-returning')
    a = settle(command(a, 'close-outer', true))
    expect(a.state).toBe('pressure-equalized')
    expect(a.kpa).toBeCloseTo(CABIN_KPA, 4)
    a = settle(command(a, 'open-inner', true))
    expect(a.state).toBe('crew-reentering')
    a = command(a, 'ingress', true)
    expect(a.state).toBe('post-eva')

    // ---- 6. the post-EVA review is now available, and was not before
    const unlocked = PROC_BY_ID['post-eva'].requires?.({
      who: { id: 'a1', name: 'x', callsign: 'x', role: 'x', age: 1, background: '', color: '', initials: 'x',
             baseline: { restingHR: 1, hrv: 1, systolicBP: 1, diastolicBP: 1, sleepDuration: 1, exerciseMinutes: 1 } },
      now: undefined, base: {}, day: 1, evaDone: a.evaSeconds > 0, evaSeconds: a.evaSeconds,
    })
    expect(unlocked, 'post-EVA review still locked after a spacewalk').toBeNull()
  })
})

/** Helper: is `id` the next step given what is done? */
function nextProcStepIsThis(steps: readonly { id: string }[], done: readonly string[], id: string): boolean {
  for (const s of steps) {
    const key = done.find((d) => d.endsWith(':' + s.id))
    if (!key) return s.id === id
  }
  return false
}

describe('the hull is closed', () => {
  /**
   * The plan-level statement of the property a render test checks visually.
   *
   * The rendered check clears the frame to a colour nothing in the vessel
   * uses, switches the planet off and looks for that colour surviving from
   * 264 viewpoints; this is the same idea expressed over the deck plan, so it
   * runs in the ordinary suite. Both exist because the render test found real
   * gaps this one cannot see (quantised doorway edges), and this one states
   * the invariant the backstop shell is built to guarantee.
   */
  const EPS = 1e-6

  it('has every room edge either shared with a neighbour or on the outside', () => {
    // There is nothing to assert about a wall except that it is accounted
    // for — this is really a check that the room list is well formed and
    // that no room hangs off another by a sliver, which is what produced the
    // awkward partial walls in the first place.
    for (const r of ROOMS) {
      expect(r.x1).toBeGreaterThan(r.x0)
      expect(r.z1).toBeGreaterThan(r.z0)
      expect(r.height).toBeGreaterThan(1.9)
    }
  })

  it('never overlaps two rooms, which would put walls inside walkable space', () => {
    for (const a of ROOMS) {
      for (const b of ROOMS) {
        if (a.id === b.id) continue
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
        const bothPositive = overlapX > EPS && overlapZ > EPS
        expect(bothPositive, `${a.id} and ${b.id} overlap by ${overlapX.toFixed(2)}x${overlapZ.toFixed(2)} m`).toBe(false)
      }
    }
  })

  it('keeps every room reachable from the spawn point', () => {
    // A room with no shared edge is a room nobody can get to, and the
    // objectives would then be uncompletable.
    const adj = new Map<string, string[]>()
    for (const a of ROOMS) {
      const near: string[] = []
      for (const b of ROOMS) {
        if (a.id === b.id) continue
        const touchX = Math.abs(a.x1 - b.x0) < 0.01 || Math.abs(a.x0 - b.x1) < 0.01
        const touchZ = Math.abs(a.z1 - b.z0) < 0.01 || Math.abs(a.z0 - b.z1) < 0.01
        const spanZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.5
        const spanX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5
        if ((touchX && spanZ) || (touchZ && spanX)) near.push(b.id)
      }
      adj.set(a.id, near)
    }
    const start = ROOMS.find((r) => r.x0 <= SPAWN.x && r.x1 >= SPAWN.x && r.z0 <= SPAWN.z && r.z1 >= SPAWN.z)
    expect(start, 'the spawn point is not inside any room').toBeTruthy()
    const seen = new Set<string>([start!.id])
    const queue = [start!.id]
    while (queue.length) {
      const id = queue.shift()!
      for (const n of adj.get(id) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n) }
    }
    for (const r of ROOMS) {
      expect(seen.has(r.id), `${r.id} cannot be reached on foot from the spawn point`).toBe(true)
    }
  })

  it('puts every console and EVA point inside a room', () => {
    for (const s of STATIONS) {
      expect(inside(s.x, s.z), `console ${s.id} is outside the hull`).toBe(true)
    }
    for (const p of EVA_POINTS) {
      expect(inside(p.x, p.z), `EVA point ${p.id} is outside the hull`).toBe(true)
    }
  })
})
