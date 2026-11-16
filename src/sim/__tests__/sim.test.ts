import { describe, expect, it } from 'vitest'
import { alertsFor, analyzeAstronaut, datasetForAstronaut, summarise } from '../analyze'
import { compareRuns, inputChanges } from '../compare'
import { LIMITS, REFERENCE_SPO2, dayInputs, modelSpO2, simulate, validateConfig } from '../engine'
import { blankMission, duplicateAstronaut, duplicateMission, exampleMissions, newAstronaut, newEvent, scenarioCopy } from '../library'
import { EFFECT_BY_ID, NOMINAL_ENVIRONMENT, SIM_INDICATORS } from '../reference'
import type { MissionConfig } from '../types'

// One fixed template, so every call has the same astronaut ids (and so the same random variation).
const TEMPLATE = blankMission()
TEMPLATE.crew = TEMPLATE.crew.map((c, i) => ({ ...c, id: `T-${i + 1}` }))
function mission(patch: Partial<MissionConfig> = {}): MissionConfig {
  return { ...structuredClone(TEMPLATE), seed: 42, durationDays: 60, events: [], ...patch }
}

const mean = (a: Float32Array, from = 1, to = a.length) => {
  let s = 0
  for (let d = from; d <= to; d++) s += a[d - 1]
  return s / (to - from + 1)
}

describe('crew size and identity', () => {
  it('simulates any crew size and keeps results attached to the right astronaut', () => {
    for (const n of [1, 2, 4, 7, 12, LIMITS.maxCrew]) {
      const crew = Array.from({ length: n }, (_, i) => newAstronaut(i, { name: `A${i}` }))
      const r = simulate(mission({ crew }))
      expect(r.astronauts).toHaveLength(n)
      expect(r.astronauts.map((a) => a.astronautId)).toEqual(crew.map((c) => c.id))
    }
  })

  it('rejects an empty or oversized crew with an explanation', () => {
    const empty = validateConfig(mission({ crew: [] }))[0]
    expect(empty.message).toMatch(/crew is empty. Add at least one astronaut/)
    expect(empty.area).toBe('crew')
    const big = Array.from({ length: LIMITS.maxCrew + 1 }, (_, i) => newAstronaut(i))
    expect(validateConfig(mission({ crew: big })).some((i) => i.level === 'error' && i.area === 'crew' && /up to 30. Untick/.test(i.message))).toBe(true)
    expect(() => simulate(mission({ crew: [] }))).toThrow()
  })

  it('simulates only participating astronauts', () => {
    const m = mission()
    m.crew[1].participates = false
    const r = simulate(m)
    expect(r.astronauts.map((a) => a.astronautId)).toEqual([m.crew[0].id])
  })

  it('starts each astronaut from their own baseline', () => {
    const m = mission({ environment: { ...NOMINAL_ENVIRONMENT, gravityG: 1 } })
    m.crew[0].baseline.restingHR = 50
    m.crew[1].baseline.restingHR = 75
    const r = simulate(m)
    expect(Math.abs(mean(r.astronauts[0].daily.restingHR) - 50)).toBeLessThan(1.5)
    expect(Math.abs(mean(r.astronauts[1].daily.restingHR) - 75)).toBeLessThan(1.5)
  })

  it('does not change one astronaut when another is added, removed or edited', () => {
    const m = mission()
    const before = simulate(m).astronauts[0].daily.restingHR
    const added = simulate({ ...m, crew: [...m.crew, newAstronaut(5)] }).astronauts[0].daily.restingHR
    const edited = structuredClone(m)
    edited.crew[1].baseline.restingHR = 90
    const afterEdit = simulate(edited).astronauts[0].daily.restingHR
    expect(Array.from(added)).toEqual(Array.from(before))
    expect(Array.from(afterEdit)).toEqual(Array.from(before))
  })

  it('duplicates an astronaut with a new id', () => {
    const m = mission()
    const copy = duplicateAstronaut(m.crew[0], 2)
    expect(copy.id).not.toBe(m.crew[0].id)
    expect(copy.baseline).toEqual(m.crew[0].baseline)
    expect(copy.name).toMatch(/copy/)
  })
})

describe('duration and resolution', () => {
  it('produces exactly one value per day for any duration', () => {
    for (const days of [1, 30, 90, 150, 365]) {
      const r = simulate(mission({ durationDays: days }))
      expect(r.days).toBe(days)
      for (const d of SIM_INDICATORS) expect(r.astronauts[0].daily[d.id].length).toBe(days)
      expect(r.environment.co2mmHg.length).toBe(days)
    }
  })

  it('produces 24 values per day at hourly resolution, with a circadian temperature rhythm', () => {
    const r = simulate(mission({ durationDays: 10, resolution: 'hourly' }))
    const h = r.astronauts[0].hourly!
    expect(h.heartRate.length).toBe(240)
    // Core temperature peaks in the late afternoon and is lowest in the early morning.
    const at = (hour: number) => {
      let s = 0
      for (let d = 0; d < 10; d++) s += h.bodyTemp[d * 24 + hour]
      return s / 10
    }
    expect(at(17)).toBeGreaterThan(at(5) + 0.4)
    // Heart rate is lower while asleep than while awake.
    let asleep = 0
    let awake = 0
    for (let d = 0; d < 10; d++) {
      asleep += h.heartRate[d * 24 + 2]
      awake += h.heartRate[d * 24 + 11]
    }
    expect(asleep).toBeLessThan(awake)
    expect(simulate(mission({ durationDays: 10 })).astronauts[0].hourly).toBeNull()
  })

  it('enforces resolution limits gracefully', () => {
    const hourlyLong = validateConfig(mission({ durationDays: LIMITS.maxDaysHourly + 1, resolution: 'hourly' }))
    expect(hourlyLong.some((i) => i.level === 'error' && i.area === 'mission' && /switch Time resolution to Daily/.test(i.message))).toBe(true)
    expect(validateConfig(mission({ durationDays: LIMITS.maxDaysDaily + 1 })).some((i) => i.level === 'error')).toBe(true)
    expect(validateConfig(mission({ durationDays: 10 })).some((i) => i.level === 'warning' && /three weeks/.test(i.message))).toBe(true)
  })

  it('says which value is wrong, what it is, and the allowed range', () => {
    const m = mission()
    m.crew[0].baseline.restingHR = 200
    m.environment.co2mmHg = 99
    const issues = validateConfig(m)
    const hr = issues.find((i) => /Resting HR/.test(i.message))!
    expect(hr.area).toBe('crew')
    expect(hr.targetId).toBe(m.crew[0].id)
    expect(hr.message).toMatch(/is 200 bpm. Set it between 30 and 120 bpm/)
    const co2 = issues.find((i) => i.area === 'environment')!
    expect(co2.message).toMatch(/is 99 .*Set it between/)
  })

  it('runs a long mission with a large crew quickly', () => {
    const crew = Array.from({ length: 12 }, (_, i) => newAstronaut(i))
    const t0 = performance.now()
    const r = simulate(mission({ durationDays: 1000, crew }))
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(r.astronauts[11].daily.fatigue.length).toBe(1000)
  })
})

describe('reproducibility', () => {
  it('gives identical results for the same seed and different results for another', () => {
    const m = exampleMissions()[0]
    const a = simulate(m)
    const b = simulate(structuredClone(m))
    for (const d of SIM_INDICATORS) expect(Array.from(b.astronauts[2].daily[d.id])).toEqual(Array.from(a.astronauts[2].daily[d.id]))
    expect(b.fingerprint).toBe(a.fingerprint)
    const c = simulate({ ...m, seed: m.seed + 1 })
    expect(Array.from(c.astronauts[0].daily.restingHR)).not.toEqual(Array.from(a.astronauts[0].daily.restingHR))
  })
})

describe('environment', () => {
  it('derives saturation from oxygen supply with the alveolar gas equation', () => {
    expect(REFERENCE_SPO2).toBeGreaterThan(96)
    expect(REFERENCE_SPO2).toBeLessThan(98)
    // Roughly 2000 m altitude air. Saturation falls. The model holds arterial CO2 at 40 mmHg (no
    // hyperventilation response), so it overstates the fall; that limitation is documented.
    const altitude = modelSpO2(16.6, 79.5)
    expect(altitude).toBeLessThan(REFERENCE_SPO2 - 3)
    expect(altitude).toBeGreaterThan(80)
    // A reduced-pressure, oxygen-enriched cabin can match sea-level saturation.
    expect(Math.abs(modelSpO2(21.2, 70.3) - REFERENCE_SPO2)).toBeLessThan(1)
  })

  it('changes outputs only through documented effects', () => {
    const base = simulate(mission())
    const hot = simulate(mission({ environment: { ...NOMINAL_ENVIRONMENT, co2mmHg: 6, noiseDBA: 65, ppO2KPa: 16 } }))
    const a = base.astronauts[0]
    const b = hot.astronauts[0]
    expect(mean(b.daily.sleepQuality)).toBeLessThan(mean(a.daily.sleepQuality) - 10)
    expect(mean(b.daily.respRate)).toBeGreaterThan(mean(a.daily.respRate) + 0.5)
    expect(mean(b.daily.spo2)).toBeLessThan(mean(a.daily.spo2) - 1)
    // Every recorded effect is a documented one.
    for (const c of b.contributions) expect(EFFECT_BY_ID[c.effectId]).toBeDefined()
    expect(b.contributions.some((c) => c.effectId === 'co2-sleep')).toBe(true)
    expect(b.contributions.some((c) => c.effectId === 'oxygen-saturation')).toBe(true)
    expect(a.contributions.some((c) => c.effectId === 'co2-sleep')).toBe(false)
  })

  it('has no effect from a variable the model does not use', () => {
    const a = simulate(mission())
    const b = simulate(mission({ environment: { ...NOMINAL_ENVIRONMENT, vibrationMS2: 3, particulatesUgM3: 300, lightingLux: 50, humidityPct: 90 } }))
    for (const d of SIM_INDICATORS) expect(Array.from(b.astronauts[0].daily[d.id])).toEqual(Array.from(a.astronauts[0].daily[d.id]))
  })

  it('makes deconditioning depend on gravity and exercise', () => {
    const m = mission({ durationDays: 120 })
    const noEx = structuredClone(m)
    noEx.crew[0].schedule.exerciseSessionsPerWeek = 0
    const micro = simulate(noEx).astronauts[0]
    const mars = simulate({ ...noEx, environment: { ...noEx.environment, gravityG: 0.38 } }).astronauts[0]
    const exercised = simulate(m).astronauts[0]
    const late = (r: typeof micro) => mean(r.daily.restingHR, 90, 120)
    expect(late(micro)).toBeGreaterThan(late(exercised) + 5)
    expect(late(mars)).toBeLessThan(late(micro))
    expect(late(mars)).toBeGreaterThan(late(exercised))
  })
})

describe('events', () => {
  it('act only on their days and on the astronauts they name', () => {
    const m = mission()
    m.events = [newEvent('sleep-disruption', 20, 5, 'Nights', { crewWide: false, astronautIds: [m.crew[1].id], params: { sleepLossHours: 4 } })]
    const r = simulate(m)
    const [a0, a1] = r.astronauts
    const base = simulate(mission()).astronauts
    expect(Array.from(a0.daily.sleepDuration)).toEqual(Array.from(base[0].daily.sleepDuration))
    expect(mean(a1.daily.sleepDuration, 20, 24)).toBeLessThan(mean(base[1].daily.sleepDuration, 20, 24) - 2)
    expect(a1.daily.sleepDuration[10]).toBe(base[1].daily.sleepDuration[10])
    expect(dayInputs(m, m.crew[1], 19).sleepOpportunity).toBe(8.5)
    expect(dayInputs(m, m.crew[1], 20).sleepOpportunity).toBe(4.5)
    expect(dayInputs(m, m.crew[1], 25).sleepOpportunity).toBe(8.5)
  })

  it('carries a sleep disruption into heart rate the following days, then recovers', () => {
    const m = mission({ environment: { ...NOMINAL_ENVIRONMENT, gravityG: 1 } })
    m.events = [newEvent('sleep-disruption', 30, 7, 'Nights', { params: { sleepLossHours: 3 } })]
    const r = simulate(m).astronauts[0]
    const base = simulate(mission({ environment: { ...NOMINAL_ENVIRONMENT, gravityG: 1 } })).astronauts[0]
    expect(mean(r.daily.restingHR, 33, 37)).toBeGreaterThan(mean(base.daily.restingHR, 33, 37) + 0.5)
    // A week of 3 h sleep loss costs reaction-test performance, and the debt takes weeks to clear (Van Dongen 2003; Belenky 2003).
    expect(mean(r.daily.pvtLapses, 33, 37)).toBeGreaterThan(mean(base.daily.pvtLapses, 33, 37) + 2.5)
    expect(mean(r.daily.sleepDebt, 45, 50)).toBeGreaterThan(mean(base.daily.sleepDebt, 45, 50))
    expect(mean(r.daily.sleepDebt, 45, 50)).toBeLessThan(mean(r.daily.sleepDebt, 36, 37))
    expect(Math.abs(mean(r.daily.restingHR, 50, 60) - mean(base.daily.restingHR, 50, 60))).toBeLessThan(0.5)
    expect(r.contributions.some((c) => c.effectId === 'sleep-debt-cardio')).toBe(true)
  })

  it('adds solar particle event dose and EVA dose to the right people', () => {
    const m = mission()
    m.events = [newEvent('solar-particle-event', 10, 2, 'SPE', { params: { doseMSv: 20, sleepLossHours: 0, stressIncrease: 0 } }), newEvent('eva', 15, 1, 'EVA', { crewWide: false, astronautIds: [m.crew[0].id], params: { hours: 6, doseMultiplier: 3, sleepLossHours: 0 } })]
    const r = simulate(m)
    const extra = (i: number) => r.astronauts[i].daily.radiationDose
    expect(extra(0)[9] + extra(0)[10]).toBeGreaterThan(20)
    expect(extra(0)[14]).toBeGreaterThan(extra(1)[14] + 0.15)
    expect(r.astronauts[0].daily.activityMinutes[14]).toBeGreaterThan(r.astronauts[1].daily.activityMinutes[14] + 300)
  })

  it('applies an environmental anomaly to the cabin for its duration only', () => {
    const m = mission()
    m.events = [newEvent('environment-anomaly', 20, 5, 'Scrubber', { envOverride: { co2mmHg: 7 } })]
    const r = simulate(m)
    expect(r.environment.co2mmHg[18]).toBeCloseTo(2.5)
    expect(r.environment.co2mmHg[19]).toBeCloseTo(7)
    expect(r.environment.co2mmHg[24]).toBeCloseTo(2.5)
  })

  it('warns about events outside the mission', () => {
    const m = mission({ durationDays: 30 })
    m.events = [newEvent('stress', 40, 2, 'Late'), newEvent('stress', 28, 10, 'Overrun')]
    const w = validateConfig(m).map((i) => i.message)
    expect(w.some((x) => /after the mission ends/.test(x))).toBe(true)
    expect(w.some((x) => /cut off on day 30/.test(x))).toBe(true)
  })
})

describe('detection and explanation', () => {
  const m = exampleMissions()[0]
  const r = simulate(m)
  const arakawa = m.crew[1]

  it('feeds the Constellation Engine with simulated data labelled synthetic', () => {
    const ds = datasetForAstronaut(m, r, arakawa.id)
    expect(ds.provenance).toBe('synthetic-demo')
    expect(ds.series.restingHR).toHaveLength(150)
    expect(ds.indicators.find((i) => i.id === 'env.co2mmHg')?.role).toBe('context')
  })

  it('detects the modeled changes and explains them with events and effects', () => {
    const analysis = analyzeAstronaut(m, r, arakawa.id)
    const alerts = alertsFor(m, r, analysis, arakawa.id)
    expect(alerts.length).toBeGreaterThan(0)
    const sleepAlert = alerts.find((a) => a.indicators.includes('sleepDuration') && a.startDay >= 85 && a.startDay <= 100)
    expect(sleepAlert).toBeDefined()
    expect(sleepAlert!.events.map((e) => e.title)).toContain('Night repair shifts')
    expect(sleepAlert!.effects.some((e) => e.effectId === 'sleep-opportunity')).toBe(true)
    for (const e of sleepAlert!.effects) expect(['established', 'simplified']).toContain(e.basis)
    expect(sleepAlert!.explanation).not.toMatch(/diagnos(is|e)d/i)
  })

  it('summarises each astronaut against their baseline', () => {
    const s = summarise(r.astronauts[0], m.crew[0].baseline as unknown as Record<string, number>)
    const hr = s.find((x) => x.indicator === 'restingHR')!
    expect(hr.baseline).toBe(56)
    expect(hr.min).toBeLessThanOrEqual(hr.mean)
    expect(hr.max).toBeGreaterThanOrEqual(hr.mean)
  })
})

describe('scenario comparison', () => {
  const a = exampleMissions()[0]
  const b = scenarioCopy(a)

  it('a scenario copy keeps seed and ids, so an unchanged copy is identical', () => {
    expect(b.seed).toBe(a.seed)
    expect(b.crew.map((c) => c.id)).toEqual(a.crew.map((c) => c.id))
    const c = compareRuns(a, simulate(a), b, simulate(b))
    expect(c.changes).toEqual([])
    for (const x of c.astronauts) for (const d of x.indicators) expect(d.diff).toBe(0)
  })

  it('attributes output differences to the changed inputs', () => {
    const better = scenarioCopy(a)
    better.events = better.events.filter((e) => e.type !== 'exercise-unavailable')
    better.environment.co2mmHg = 2
    const c = compareRuns(a, simulate(a), better, simulate(better))
    expect(c.changes.some((x) => x.area === 'event' && /Treadmill/.test(x.label))).toBe(true)
    expect(c.changes.some((x) => /Carbon dioxide/.test(x.label))).toBe(true)
    const holt = c.astronauts[0]
    expect(holt.effects.some((e) => e.effectId === 'deconditioning')).toBe(true)
    expect(holt.effects.some((e) => e.effectId === 'activity-accounting')).toBe(true)
    // Unrelated effects do not appear as differences.
    expect(holt.effects.some((e) => e.effectId === 'dose-accounting')).toBe(false)
    expect(holt.indicators.find((d) => d.indicator === 'activityMinutes')!.diff).toBeGreaterThan(0)
  })

  it('flags comparisons with different seeds', () => {
    const other = { ...scenarioCopy(a), seed: 1 }
    expect(compareRuns(a, simulate(a), other, simulate(other)).reason).toMatch(/different random seeds/)
    expect(inputChanges(a, other).some((x) => x.label === 'Random seed')).toBe(true)
  })

  it('a duplicated mission gets fresh ids but the same inputs', () => {
    const d = duplicateMission(a)
    expect(d.id).not.toBe(a.id)
    expect(d.crew[0].id).not.toBe(a.crew[0].id)
    const tied = d.events.find((e) => !e.crewWide)!
    expect(d.crew.some((c) => c.id === tied.astronautIds[0])).toBe(true)
  })
})

describe('example missions', () => {
  it('are valid, varied and runnable', () => {
    const ex = exampleMissions()
    expect(new Set(ex.map((m) => m.durationDays)).size).toBe(3)
    for (const m of ex) {
      expect(validateConfig(m).filter((i) => i.level === 'error')).toEqual([])
      expect(simulate(m).astronauts.length).toBe(m.crew.length)
    }
  })
})
