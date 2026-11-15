import { describe, expect, it } from 'vitest'
import { createMissionAnalysis } from '../analysis'
import { effectiveSampleSize } from '../relationships'
import { createRng } from '../../lib/random'
import { dataset, indicator, noise } from './helpers'

const N = 140

/** sleep drives fatigue the next day; hr and exercise are independent of both. */
function coupled(seed = 900, trend = 0) {
  const rng = createRng(seed)
  const sleep: number[] = []
  const fatigue: number[] = []
  const hr: number[] = []
  const exercise: number[] = []
  let prev = 0
  for (let d = 1; d <= N; d++) {
    const e = rng.normal(0, 0.5)
    sleep.push(7 + e + trend * d * -0.01)
    fatigue.push(3.5 - 0.9 * prev + rng.normal(0, 0.4) + trend * d * 0.012)
    hr.push(58 + rng.normal(0, 2))
    exercise.push(90 + rng.normal(0, 9))
    prev = e
  }
  return dataset(
    [indicator('sleep', 'sleep'), indicator('fatigue', 'behavioral'), indicator('hr', 'cardio'), indicator('exercise', 'activity')],
    { sleep, fatigue, hr, exercise },
  )
}

describe('relationship evaluation', () => {
  it('finds a planted lagged association with the right leader, lag and sign', () => {
    const an = createMissionAnalysis(coupled())
    const r = an.relationshipBetween('sleep', 'fatigue', N)!
    expect(r.status).toBe('supported')
    expect(r.leader).toBe('sleep')
    expect(r.follower).toBe('fatigue')
    expect(r.lagDays).toBe(1)
    expect(r.rho).toBeLessThan(-0.4)
    expect(r.qValue).toBeLessThan(0.01)
    expect(r.consistentAcrossHalves).toBe(true)
    expect(r.explanation).toMatch(/opposite directions/)
    expect(r.limitations.join(' ')).toMatch(/does not show that one measurement causes the other/)
  })

  it('is symmetric in the order the pair is requested', () => {
    const an = createMissionAnalysis(coupled())
    expect(an.relationshipBetween('fatigue', 'sleep', N)!.id).toBe(an.relationshipBetween('sleep', 'fatigue', N)!.id)
  })

  it('does not support a relationship between independent indicators', () => {
    const an = createMissionAnalysis(coupled())
    for (const [a, b] of [
      ['hr', 'exercise'],
      ['sleep', 'hr'],
      ['fatigue', 'exercise'],
    ]) {
      const r = an.relationshipBetween(a, b, N)!
      expect(r.status).toBe('not-established')
      expect(r.reason.length).toBeGreaterThan(10)
    }
  })

  it('does not mistake a shared trend for a relationship', () => {
    // Two independent series that both drift strongly over the mission.
    const a = noise(N, 910, 50, 2, (d) => 0.15 * d)
    const b = noise(N, 911, 80, 3, (d) => 0.2 * d)
    const an = createMissionAnalysis(dataset([indicator('a', 'A'), indicator('b', 'B')], { a, b }))
    const r = an.relationshipBetween('a', 'b', N)!
    expect(r.status).toBe('not-established')
    // Both are far from baseline at the same time, and the engine says so without counting it as evidence.
    expect(r.overlapDays).toBeGreaterThan(30)
    expect(r.explanation).toMatch(/not, by itself, evidence/)
  })

  it('still finds the real association when both indicators also share a trend', () => {
    const an = createMissionAnalysis(coupled(905, 1))
    const r = an.relationshipBetween('sleep', 'fatigue', N)!
    expect(r.status).toBe('supported')
    expect(r.lagDays).toBe(1)
  })

  it('withholds judgement until enough paired days exist', () => {
    const an = createMissionAnalysis(coupled())
    const early = an.relationshipBetween('sleep', 'fatigue', 20)!
    expect(early.status).toBe('insufficient-data')
    expect(early.reason).toMatch(/at least 30/)
    expect(an.relationshipBetween('sleep', 'fatigue', 80)!.status).toBe('supported')
  })

  it('cannot evaluate sparsely sampled indicators day to day', () => {
    const weekly: (number | null)[] = new Array(N).fill(null)
    for (let d = 3; d <= N; d += 7) weekly[d - 1] = 100 + (d % 5)
    const ds = coupled()
    ds.indicators.push(indicator('strength', 'activity', { cadenceDays: 7 }))
    ds.series.strength = weekly
    const r = createMissionAnalysis(ds).relationshipBetween('sleep', 'strength', N)!
    expect(r.status).toBe('insufficient-data')
    expect(r.reason).toMatch(/too sparse/)
  })

  it('keeps the false-discovery rate low across many unrelated pairs', () => {
    const defs = Array.from({ length: 8 }, (_, k) => indicator(`v${k}`, `C${k % 4}`))
    let supported = 0
    let tested = 0
    for (let s = 0; s < 5; s++) {
      const series: Record<string, number[]> = {}
      defs.forEach((d, k) => {
        series[d.id] = noise(N, 2000 + s * 50 + k, 10, 1)
      })
      const rel = createMissionAnalysis(dataset(defs, series)).relationshipsAt(N)
      tested += rel.length
      supported += rel.filter((r) => r.status === 'supported').length
    }
    expect(tested).toBe(140)
    expect(supported).toBeLessThanOrEqual(2)
  })

  it('shrinks the effective sample size for autocorrelated series', () => {
    expect(effectiveSampleSize(100, [0, 0, 0], [0, 0, 0])).toBe(100)
    expect(effectiveSampleSize(100, [0.6, 0.36, 0.2], [0.6, 0.36, 0.2])).toBeLessThan(60)
  })

  it('uses only data up to the requested day', () => {
    const ds = coupled()
    const full = createMissionAnalysis(ds).relationshipBetween('sleep', 'fatigue', 90)!
    const truncated = { ...ds, totalDays: 90, series: Object.fromEntries(Object.entries(ds.series).map(([k, v]) => [k, v.slice(0, 90)])) }
    const cut = createMissionAnalysis(truncated).relationshipBetween('sleep', 'fatigue', 90)!
    expect(cut.rho).toBeCloseTo(full.rho, 10)
    expect(cut.nPairs).toBe(full.nPairs)
  })
})
