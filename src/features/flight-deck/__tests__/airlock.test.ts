import { describe, expect, it } from 'vitest'
import {
  ALL_AIRLOCK_STATES,
  CABIN_KPA,
  EQUALISED_KPA,
  VACUUM_KPA,
  advance,
  bothHatchesOpen,
  command,
  innerHatch,
  isOutside,
  newAirlock,
  outerHatch,
  phaseSeconds,
  refuse,
  statusLine,
  type Airlock,
  type AirlockCommand,
} from '../model/airlock'
import {
  EVA_TASKS,
  TETHER_LENGTH,
  constrainToTether,
  nextStep,
  siteInReach,
  stepKey,
  taskComplete,
  tetherDistance,
} from '../model/eva'
import { DONNING, INSPECTION, STAGES, don, newSuitPrep, nextDonning, prepComplete, stageOf, type SuitPrep } from '../model/suit'

/** Drive a phase to its end so the machine moves on by itself. */
function runOut(a: Airlock): Airlock {
  const total = phaseSeconds(a.state)
  if (total <= 0) return a
  return advance(a, total + 0.01)
}

/** Walk the whole sequence, egress to ingress, and hand back every state seen. */
function fullCycle(): { states: string[]; final: Airlock } {
  let a = newAirlock()
  const states: string[] = [a.state]
  const push = (next: Airlock) => {
    a = next
    states.push(a.state)
  }
  const cmds: AirlockCommand[] = [
    'enter', 'close-inner', 'confirm-suit', 'begin-prebreathe', 'begin-depress',
    'open-outer', 'egress', 'return', 'close-outer', 'begin-repress', 'open-inner',
    'ingress', 'finish',
  ]
  for (const c of cmds) {
    push(command(a, c, true))
    // Let any timed phase complete before the next command.
    let guard = 0
    while (phaseSeconds(a.state) > 0 && guard++ < 10) push(runOut(a))
  }
  return { states, final: a }
}

describe('airlock safety', () => {
  it('never has both hatches open in any state', () => {
    for (const s of ALL_AIRLOCK_STATES) {
      expect(bothHatchesOpen(s), `both hatches open in ${s}`).toBe(false)
    }
  })

  it('never reaches a state with both hatches open during a full cycle', () => {
    const { states } = fullCycle()
    for (const s of states) {
      expect(bothHatchesOpen(s as never), `both hatches open at ${s}`).toBe(false)
    }
  })

  it('keeps the inner hatch locked for the whole time the outer one is not', () => {
    for (const s of ALL_AIRLOCK_STATES) {
      const o = outerHatch(s)
      if (o === 'open' || o === 'opening') {
        expect(innerHatch(s), `inner hatch was ${innerHatch(s)} while outer was ${o} in ${s}`).toBe('locked')
      }
    }
  })

  it('refuses to open the outer hatch until the chamber is at vacuum', () => {
    let a = newAirlock()
    for (const c of ['enter', 'close-inner'] as AirlockCommand[]) {
      a = command(a, c, true)
      a = runOut(a)
    }
    a = command(a, 'confirm-suit', true)
    a = command(a, 'begin-prebreathe', true)
    a = runOut(a)
    a = command(a, 'begin-depress', true)
    // Part way through the pump-down the hatch must still refuse.
    a = advance(a, phaseSeconds('depressurizing') * 0.5)
    expect(a.kpa).toBeGreaterThan(VACUUM_KPA)
    const blocked = command(a, 'open-outer', true)
    expect(blocked.state).toBe('depressurizing')
    expect(blocked.refusal).toBeTruthy()
    // And must allow it once the chamber is down.
    a = runOut(a)
    expect(a.state).toBe('vacuum-ready')
    expect(a.kpa).toBeLessThanOrEqual(VACUUM_KPA)
    expect(command(a, 'open-outer', true).state).toBe('outer-hatch-unlocking')
  })

  it('refuses to open the inner hatch until pressure is equalised', () => {
    let a: Airlock = { ...newAirlock(), state: 'repressurizing', kpa: 0, t: 0 }
    a = advance(a, phaseSeconds('repressurizing') * 0.5)
    expect(a.kpa).toBeLessThan(EQUALISED_KPA)
    expect(command(a, 'open-inner', true).refusal).toBeTruthy()
    a = runOut(a)
    expect(a.state).toBe('pressure-equalized')
    expect(a.kpa).toBeCloseTo(CABIN_KPA, 5)
    expect(command(a, 'open-inner', true).state).toBe('inner-hatch-unlocking')
  })

  it('refuses to seal the inner hatch until the suit is ready', () => {
    const a = command(newAirlock(), 'enter', true)
    expect(command(a, 'close-inner', false).refusal).toBeTruthy()
    expect(command(a, 'close-inner', false).state).toBe('crew-entering')
    expect(command(a, 'close-inner', true).state).toBe('inner-hatch-closing')
  })

  it('refuses every command that is out of sequence', () => {
    const a = newAirlock()
    const outOfOrder: AirlockCommand[] = [
      'close-inner', 'confirm-suit', 'begin-prebreathe', 'begin-depress',
      'open-outer', 'egress', 'return', 'close-outer', 'begin-repress',
      'open-inner', 'ingress', 'finish',
    ]
    for (const c of outOfOrder) {
      expect(refuse(a, c, true), `${c} should be refused from idle`).toBeTruthy()
      expect(command(a, c, true).state, `${c} moved the machine from idle`).toBe('idle')
    }
  })

  it('completes a full cycle and returns to idle', () => {
    const { final, states } = fullCycle()
    expect(states).toContain('eva-active')
    expect(states).toContain('vacuum-ready')
    expect(states).toContain('pressure-equalized')
    expect(final.state).toBe('idle')
    expect(final.kpa).toBeCloseTo(CABIN_KPA, 5)
  })

  it('pressure moves progressively, never in one step', () => {
    let a: Airlock = { ...newAirlock(), state: 'depressurizing', t: 0 }
    const seen: number[] = []
    for (let i = 0; i < 20; i++) {
      a = advance(a, phaseSeconds('depressurizing') / 20)
      seen.push(a.kpa)
    }
    // Monotonically falling, and no single step drops more than half the range.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-9)
      expect(seen[i - 1] - seen[i]).toBeLessThan(CABIN_KPA * 0.5)
    }
    expect(seen.at(-1)).toBeLessThanOrEqual(VACUUM_KPA)
  })

  it('counts EVA time only while outside', () => {
    let a: Airlock = { ...newAirlock(), state: 'inner-hatch-locked' }
    a = advance(a, 10)
    expect(a.evaSeconds).toBe(0)
    a = { ...a, state: 'eva-active' }
    a = advance(a, 10)
    expect(a.evaSeconds).toBeCloseTo(10, 5)
    expect(isOutside('eva-active')).toBe(true)
    expect(isOutside('idle')).toBe(false)
  })

  it('an abort from outside still goes through repressurisation', () => {
    const a: Airlock = { ...newAirlock(), state: 'eva-active', kpa: 0 }
    const aborted = command(a, 'abort', true)
    expect(aborted.state).toBe('outer-hatch-closing')
    expect(outerHatch(aborted.state)).not.toBe('open')
    // It must not land anywhere that skips the pressure sequence.
    expect(innerHatch(aborted.state)).toBe('locked')
  })

  it('gives every state a status line', () => {
    for (const s of ALL_AIRLOCK_STATES) {
      expect(statusLine({ ...newAirlock(), state: s }).length).toBeGreaterThan(4)
    }
  })
})

describe('suit preparation', () => {
  it('is not complete until every stage is satisfied', () => {
    const p = newSuitPrep()
    expect(prepComplete(p)).toBe(false)
    expect(stageOf(p)).toBe('select')
  })

  it('refuses a donning step taken out of order', () => {
    let p: SuitPrep = { ...newSuitPrep(), selected: 'emu-1' }
    // The helmet cannot go on first.
    const skipped = don(p, 'helmet')
    expect(skipped.donned).toHaveLength(0)
    // In order, each one is accepted.
    for (const d of DONNING) {
      expect(nextDonning(p)).toBe(d.id)
      p = don(p, d.id)
    }
    expect(nextDonning(p)).toBeNull()
    expect(p.donned).toHaveLength(DONNING.length)
  })

  it('requires all four inspection points, not just one', () => {
    const base: SuitPrep = { ...newSuitPrep(), selected: 'emu-1' }
    const inspect = STAGES.find((s) => s.id === 'inspect')!
    expect(inspect.need({ ...base, inspected: [INSPECTION[0].id] })).toBe(false)
    expect(inspect.need({ ...base, inspected: INSPECTION.map((i) => i.id) })).toBe(true)
  })

  it('requires a tether and at least two tools', () => {
    const base = newSuitPrep()
    const tether = STAGES.find((s) => s.id === 'tether')!
    expect(tether.need({ ...base, tetherAttached: false, tools: ['pgt', 'scoop'] })).toBe(false)
    expect(tether.need({ ...base, tetherAttached: true, tools: ['pgt'] })).toBe(false)
    expect(tether.need({ ...base, tetherAttached: true, tools: ['pgt', 'scoop'] })).toBe(true)
  })
})

describe('spacewalk tasks', () => {
  it('has five tasks, each with ordered steps', () => {
    expect(EVA_TASKS).toHaveLength(5)
    for (const t of EVA_TASKS) {
      expect(t.steps.length).toBeGreaterThanOrEqual(4)
      const ids = new Set(t.steps.map((s) => s.id))
      expect(ids.size, `${t.id} has duplicate step ids`).toBe(t.steps.length)
    }
  })

  it('does not complete a task by reaching its worksite', () => {
    for (const t of EVA_TASKS) {
      const { x, y, z } = t.site
      expect(siteInReach(x, y, z)?.id).toBe(t.id)
      // Standing on it completes nothing.
      expect(taskComplete(t, [])).toBe(false)
      expect(nextStep(t, [])).toBe(t.steps[0])
    }
  })

  it('completes a task only when every step is done', () => {
    const t = EVA_TASKS[0]
    const all = t.steps.map((s) => stepKey(t.id, s.id))
    for (let i = 0; i < all.length; i++) {
      expect(taskComplete(t, all.slice(0, i))).toBe(false)
    }
    expect(taskComplete(t, all)).toBe(true)
  })

  it('keeps steps in order', () => {
    const t = EVA_TASKS[1]
    let done: string[] = []
    for (const s of t.steps) {
      expect(nextStep(t, done)?.id).toBe(s.id)
      done = [...done, stepKey(t.id, s.id)]
    }
    expect(nextStep(t, done)).toBeNull()
  })

  it('names tools that suit preparation can actually supply', () => {
    const available = new Set(['pgt', 'tether-short', 'wire-cutter', 'scoop'])
    for (const t of EVA_TASKS) {
      for (const s of t.steps) {
        if (s.needs) expect(available.has(s.needs), `${t.id}:${s.id} needs unknown tool ${s.needs}`).toBe(true)
      }
    }
  })

  it('places every worksite within the tether', () => {
    for (const t of EVA_TASKS) {
      const d = tetherDistance(t.site.x, t.site.y, t.site.z)
      expect(d, `${t.id} is ${d.toFixed(1)} m out, beyond the ${TETHER_LENGTH} m tether`).toBeLessThan(TETHER_LENGTH)
    }
  })

  it('holds a crew member inside the tether', () => {
    const far = constrainToTether(500, 500, 500)
    expect(tetherDistance(far.x, far.y, far.z)).toBeLessThanOrEqual(TETHER_LENGTH + 1e-6)
    expect(far.taut).toBe(true)
    const near = constrainToTether(-12, 2, -20)
    expect(near.taut).toBe(false)
  })

  it('does not put two worksites within reach of each other', () => {
    for (const a of EVA_TASKS) {
      for (const b of EVA_TASKS) {
        if (a.id === b.id) continue
        const d = Math.hypot(a.site.x - b.site.x, a.site.y - b.site.y, a.site.z - b.site.z)
        expect(d, `${a.id} and ${b.id} overlap`).toBeGreaterThan(a.site.reach + b.site.reach)
      }
    }
  })
})
